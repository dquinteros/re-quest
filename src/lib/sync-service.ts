import { InstallationAccountType, Prisma } from "@prisma/client";
import { Octokit, type RestEndpointMethodTypes } from "@octokit/rest";
import { prisma } from "@/lib/db";
import { getTrackedRepoRefs, mapCombinedStatusToCiState, type RepoRef } from "@/lib/github";
import { getOAuthAccessTokenForUser } from "@/lib/oauth-account";
import { upsertAttentionState } from "@/lib/pr-attention";

type PullListItem =
  RestEndpointMethodTypes["pulls"]["list"]["response"]["data"][number];
type PullReview =
  RestEndpointMethodTypes["pulls"]["listReviews"]["response"]["data"][number];

export interface OAuthSyncUser {
  id: string;
  login: string;
  githubId: bigint;
  githubToken: string;
}

export interface SyncIssue {
  repository: string;
  message: string;
  pullNumber?: number;
}

export interface SyncResult {
  runId: string;
  trigger: "MANUAL" | "POLL";
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  pulledCount: number;
  upsertedCount: number;
  errorCount: number;
  viewerLogin: string | null;
  startedAt: string;
  finishedAt: string;
  errors: SyncIssue[];
}

export interface TrackedRepositoryRecord {
  id: string;
  fullName: string;
  owner: string;
  name: string;
}

export interface RunSyncOptions {
  trigger?: "MANUAL" | "POLL";
  user?: {
    id: string;
    login: string;
    githubId: bigint | number | string;
    githubToken: string;
  };
  login?: string;
}

function asInputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function createOAuthOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

function normalizeUser(input: RunSyncOptions["user"]): OAuthSyncUser {
  if (!input) {
    throw new Error("Missing OAuth user");
  }

  const githubId =
    typeof input.githubId === "bigint"
      ? input.githubId
      : BigInt(typeof input.githubId === "number" ? Math.trunc(input.githubId) : input.githubId);

  return {
    id: input.id,
    login: input.login,
    githubId,
    githubToken: input.githubToken,
  };
}

async function selectStoredOAuthUsers(login?: string): Promise<OAuthSyncUser[]> {
  const accounts = await prisma.oAuthAccount.findMany({
    where: {
      provider: "github",
      ...(login
        ? {
            user: {
              login: {
                equals: login,
                mode: "insensitive",
              },
            },
          }
        : {}),
    },
    include: {
      user: {
        select: {
          id: true,
          login: true,
          githubId: true,
        },
      },
    },
    orderBy: {
      user: {
        login: "asc",
      },
    },
  });

  const users: OAuthSyncUser[] = [];
  for (const account of accounts) {
    if (!account.accessTokenEncrypted || !account.user.githubId) {
      continue;
    }

    let githubToken: string;
    try {
      githubToken = await getOAuthAccessTokenForUser({ userId: account.user.id });
    } catch {
      continue;
    }

    users.push({
      id: account.user.id,
      login: account.user.login,
      githubId: account.user.githubId,
      githubToken,
    });
  }

  return users;
}

async function resolveRunUser(options: RunSyncOptions): Promise<OAuthSyncUser> {
  if (options.user) {
    return normalizeUser(options.user);
  }

  const users = await selectStoredOAuthUsers(options.login);

  if (users.length === 0) {
    if (options.login) {
      throw new Error(`No stored GitHub OAuth token found for login '${options.login}'`);
    }

    throw new Error(
      "No stored GitHub OAuth tokens found. Sign in first, or provide --login for a stored OAuth user.",
    );
  }

  if (!options.login && users.length > 1) {
    throw new Error(
      `Multiple OAuth users found (${users.map((user) => user.login).join(", ")}). Use --login <github-login>.`,
    );
  }

  return users[0];
}

function toPullRequestState(pull: PullListItem): "OPEN" | "CLOSED" | "MERGED" {
  if (pull.merged_at) {
    return "MERGED";
  }

  return pull.state === "closed" ? "CLOSED" : "OPEN";
}

function extractLabels(pull: PullListItem): string[] {
  return pull.labels
    .map((label) => (typeof label === "string" ? label : label.name))
    .filter((label): label is string => Boolean(label));
}

function extractAssignees(pull: PullListItem): string[] {
  if (!pull.assignees) {
    return [];
  }

  return pull.assignees
    .map((assignee) => assignee?.login)
    .filter((login): login is string => Boolean(login));
}

function extractRequestedReviewers(pull: PullListItem): string[] {
  const users = (pull.requested_reviewers ?? [])
    .map((reviewer) => reviewer?.login)
    .filter((login): login is string => Boolean(login));

  const teams = (pull.requested_teams ?? [])
    .map((team) => team.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => `team:${slug}`);

  return [...users, ...teams];
}

function mapReviewState(state?: string | null): "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "UNREVIEWED" {
  if (state === "APPROVED") {
    return "APPROVED";
  }

  if (state === "CHANGES_REQUESTED") {
    return "CHANGES_REQUESTED";
  }

  if (state === "COMMENTED") {
    return "COMMENTED";
  }

  return "UNREVIEWED";
}

function latestReview(reviews: PullReview[]): PullReview | null {
  let latest: PullReview | null = null;

  for (const review of reviews) {
    if (review.state === "PENDING") {
      continue;
    }

    if (!latest) {
      latest = review;
      continue;
    }

    const currentTimestamp = new Date(review.submitted_at ?? 0).getTime();
    const latestTimestamp = new Date(latest.submitted_at ?? 0).getTime();
    if (currentTimestamp > latestTimestamp) {
      latest = review;
    }
  }

  return latest;
}

async function resolveReviewState(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    pullNumber: number;
    draft: boolean;
    requestedReviewers: string[];
  },
): Promise<"REVIEW_REQUESTED" | "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "UNREVIEWED" | "DRAFT"> {
  if (params.draft) {
    return "DRAFT";
  }

  if (params.requestedReviewers.length > 0) {
    return "REVIEW_REQUESTED";
  }

  try {
    const reviews = await octokit.paginate(octokit.rest.pulls.listReviews, {
      owner: params.owner,
      repo: params.repo,
      pull_number: params.pullNumber,
      per_page: 100,
    });

    return mapReviewState(latestReview(reviews)?.state);
  } catch {
    return "UNREVIEWED";
  }
}

async function resolveCiState(
  octokit: Octokit,
  params: {
    owner: string;
    repo: string;
    ref: string;
  },
): Promise<"SUCCESS" | "FAILURE" | "PENDING" | "UNKNOWN"> {
  try {
    const response = await octokit.rest.repos.getCombinedStatusForRef({
      owner: params.owner,
      repo: params.repo,
      ref: params.ref,
    });

    if (response.data.total_count === 0) {
      return "UNKNOWN";
    }

    if (
      response.data.state === "failure" ||
      response.data.state === "pending" ||
      response.data.state === "success" ||
      response.data.state === "unknown"
    ) {
      return mapCombinedStatusToCiState(response.data.state);
    }

    return "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function parseRepoFullName(fullName: string): RepoRef {
  const [owner, repo] = fullName.split("/").map((item) => item.trim());
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${fullName}. Use owner/repo.`);
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}

async function ensureUserInstallation(user: OAuthSyncUser): Promise<string> {
  const installation = await prisma.gitHubInstallation.upsert({
    where: {
      githubInstallationId: user.githubId,
    },
    create: {
      githubInstallationId: user.githubId,
      accountLogin: user.login,
      accountType: InstallationAccountType.USER,
      userId: user.id,
      lastSyncedAt: new Date(),
    },
    update: {
      accountLogin: user.login,
      accountType: InstallationAccountType.USER,
      userId: user.id,
      lastSyncedAt: new Date(),
    },
  });

  return installation.id;
}

function toTrackedRepositoryRecord(repo: {
  id: string;
  fullName: string;
  owner: string;
  name: string;
}): TrackedRepositoryRecord {
  return {
    id: repo.id,
    fullName: repo.fullName,
    owner: repo.owner,
    name: repo.name,
  };
}

async function upsertTrackedRepositoryFromGitHub(params: {
  octokit: Octokit;
  installationId: string;
  userId: string;
  repoRef: RepoRef;
}): Promise<TrackedRepositoryRecord> {
  const repoDetails = await params.octokit.rest.repos.get({
    owner: params.repoRef.owner,
    repo: params.repoRef.repo,
  });

  const repository = await prisma.repository.upsert({
    where: {
      fullName: params.repoRef.fullName,
    },
    create: {
      installationId: params.installationId,
      userId: params.userId,
      githubRepoId: BigInt(repoDetails.data.id),
      owner: params.repoRef.owner,
      name: params.repoRef.repo,
      fullName: params.repoRef.fullName,
      defaultBranch: repoDetails.data.default_branch,
      isTracked: true,
    },
    update: {
      installationId: params.installationId,
      userId: params.userId,
      githubRepoId: BigInt(repoDetails.data.id),
      owner: params.repoRef.owner,
      name: params.repoRef.repo,
      fullName: params.repoRef.fullName,
      defaultBranch: repoDetails.data.default_branch,
      isTracked: true,
    },
    select: {
      id: true,
      fullName: true,
      owner: true,
      name: true,
    },
  });

  return toTrackedRepositoryRecord(repository);
}

export async function listTrackedRepositoriesForUser(userId: string): Promise<TrackedRepositoryRecord[]> {
  const repositories = await prisma.repository.findMany({
    where: {
      isTracked: true,
      OR: [{ userId }, { installation: { userId } }],
    },
    select: {
      id: true,
      fullName: true,
      owner: true,
      name: true,
    },
    orderBy: {
      fullName: "asc",
    },
  });

  return repositories.map(toTrackedRepositoryRecord);
}

export async function addTrackedRepositoryForUser(params: {
  user: OAuthSyncUser;
  fullName: string;
}): Promise<TrackedRepositoryRecord> {
  const repoRef = parseRepoFullName(params.fullName);
  const octokit = createOAuthOctokit(params.user.githubToken);
  const installationId = await ensureUserInstallation(params.user);

  return upsertTrackedRepositoryFromGitHub({
    octokit,
    installationId,
    userId: params.user.id,
    repoRef,
  });
}

export async function removeTrackedRepositoryForUserById(params: {
  userId: string;
  id: string;
}): Promise<TrackedRepositoryRecord | null> {
  const existing = await prisma.repository.findFirst({
    where: {
      id: params.id,
      isTracked: true,
      OR: [{ userId: params.userId }, { installation: { userId: params.userId } }],
    },
    select: {
      id: true,
      fullName: true,
      owner: true,
      name: true,
    },
  });

  if (!existing) {
    return null;
  }

  await prisma.repository.update({
    where: {
      id: existing.id,
    },
    data: {
      isTracked: false,
    },
  });

  return toTrackedRepositoryRecord(existing);
}

export async function removeTrackedRepositoryForUserByFullName(params: {
  userId: string;
  fullName: string;
}): Promise<TrackedRepositoryRecord | null> {
  const existing = await prisma.repository.findFirst({
    where: {
      isTracked: true,
      OR: [{ userId: params.userId }, { installation: { userId: params.userId } }],
      fullName: {
        equals: params.fullName,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      fullName: true,
      owner: true,
      name: true,
    },
  });

  if (!existing) {
    return null;
  }

  await prisma.repository.update({
    where: {
      id: existing.id,
    },
    data: {
      isTracked: false,
    },
  });

  return toTrackedRepositoryRecord(existing);
}

async function resolveTrackedRepoRefsForSync(params: {
  user: OAuthSyncUser;
  octokit: Octokit;
  installationId: string;
}): Promise<{
  refs: RepoRef[];
  errors: SyncIssue[];
}> {
  const errors: SyncIssue[] = [];
  const existing = await listTrackedRepositoriesForUser(params.user.id);

  if (existing.length > 0) {
    return {
      refs: existing.map((repo) => parseRepoFullName(repo.fullName)),
      errors,
    };
  }

  const fallbackTracked = getTrackedRepoRefs();
  for (const repoRef of fallbackTracked) {
    try {
      await upsertTrackedRepositoryFromGitHub({
        octokit: params.octokit,
        installationId: params.installationId,
        userId: params.user.id,
        repoRef,
      });
    } catch (error) {
      errors.push({
        repository: repoRef.fullName,
        message: error instanceof Error ? error.message : "Unable to seed tracked repository",
      });
    }
  }

  const seeded = await listTrackedRepositoriesForUser(params.user.id);

  return {
    refs: seeded.map((repo) => parseRepoFullName(repo.fullName)),
    errors,
  };
}

async function syncRepository(
  params: {
    octokit: Octokit;
    repoRef: RepoRef;
    installationId: string;
    userId: string;
    viewerLogin: string | null;
  },
): Promise<{
  pulledCount: number;
  upsertedCount: number;
  errors: SyncIssue[];
}> {
  const octokit = params.octokit;
  const { owner, repo, fullName } = params.repoRef;
  const errors: SyncIssue[] = [];

  const repository = await upsertTrackedRepositoryFromGitHub({
    octokit,
    installationId: params.installationId,
    userId: params.userId,
    repoRef: params.repoRef,
  });

  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo,
    state: "open",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  let upsertedCount = 0;

  for (const pull of pulls) {
    try {
      const labels = extractLabels(pull);
      const assignees = extractAssignees(pull);
      const requestedReviewers = extractRequestedReviewers(pull);
      const reviewState = await resolveReviewState(octokit, {
        owner,
        repo,
        pullNumber: pull.number,
        draft: Boolean(pull.draft),
        requestedReviewers,
      });

      const ciState = await resolveCiState(octokit, {
        owner,
        repo,
        ref: pull.head.sha,
      });

      const headRef = pull.head.ref ?? null;
      const baseRef = pull.base.ref ?? null;

      const pullRequest = await prisma.pullRequest.upsert({
        where: {
          repositoryId_number: {
            repositoryId: repository.id,
            number: pull.number,
          },
        },
        create: {
          repositoryId: repository.id,
          githubPullRequestId: BigInt(pull.id),
          number: pull.number,
          nodeId: pull.node_id,
          title: pull.title,
          body: pull.body,
          state: toPullRequestState(pull),
          draft: Boolean(pull.draft),
          url: pull.html_url,
          authorLogin: pull.user?.login ?? "unknown",
          authorAvatarUrl: pull.user?.avatar_url ?? null,
          ciState,
          reviewState,
          githubCreatedAt: new Date(pull.created_at),
          githubUpdatedAt: new Date(pull.updated_at),
          lastActivityAt: new Date(pull.updated_at),
          labels,
          assignees,
          requestedReviewers,
          milestone: pull.milestone?.title ?? null,
          projects: [],
          raw: asInputJson(pull),
          headRef,
          baseRef,
        },
        update: {
          githubPullRequestId: BigInt(pull.id),
          nodeId: pull.node_id,
          title: pull.title,
          body: pull.body,
          state: toPullRequestState(pull),
          draft: Boolean(pull.draft),
          url: pull.html_url,
          authorLogin: pull.user?.login ?? "unknown",
          authorAvatarUrl: pull.user?.avatar_url ?? null,
          ciState,
          reviewState,
          githubUpdatedAt: new Date(pull.updated_at),
          lastActivityAt: new Date(pull.updated_at),
          labels,
          assignees,
          requestedReviewers,
          milestone: pull.milestone?.title ?? null,
          raw: asInputJson(pull),
          headRef,
          baseRef,
        },
      });

      await upsertAttentionState({
        pullRequestId: pullRequest.id,
        reviewState,
        ciState,
        isDraft: Boolean(pull.draft),
        updatedAt: new Date(pull.updated_at),
        assignees,
        requestedReviewers,
        body: pull.body,
        viewerLogin: params.viewerLogin,
      });

      upsertedCount += 1;
    } catch (error) {
      errors.push({
        repository: fullName,
        pullNumber: pull.number,
        message: error instanceof Error ? error.message : "Unknown pull request sync error",
      });
    }
  }

  return {
    pulledCount: pulls.length,
    upsertedCount,
    errors,
  };
}

export async function runSync(options: RunSyncOptions = {}): Promise<SyncResult> {
  const trigger = options.trigger ?? "POLL";
  const runUser = await resolveRunUser(options);
  const octokit = createOAuthOctokit(runUser.githubToken);

  const me = await octokit.rest.users.getAuthenticated();
  const user = await prisma.user.upsert({
    where: { githubId: BigInt(me.data.id) },
    create: {
      githubId: BigInt(me.data.id),
      login: me.data.login,
      name: me.data.name,
      avatarUrl: me.data.avatar_url,
    },
    update: {
      login: me.data.login,
      name: me.data.name,
      avatarUrl: me.data.avatar_url,
    },
  });

  const syncUser: OAuthSyncUser = {
    id: user.id,
    login: user.login,
    githubId: user.githubId,
    githubToken: runUser.githubToken,
  };

  const installationId = await ensureUserInstallation(syncUser);
  const trackedRepoResolution = await resolveTrackedRepoRefsForSync({
    user: syncUser,
    octokit,
    installationId,
  });
  const trackedRepos = trackedRepoResolution.refs;

  const syncRun = await prisma.syncRun.create({
      data: {
        userId: syncUser.id,
        trigger,
        status: "RUNNING",
        viewerLogin: syncUser.login,
      trackedRepos: trackedRepos.map((item) => item.fullName),
    },
  });

  const errors: SyncIssue[] = [...trackedRepoResolution.errors];
  let pulledCount = 0;
  let upsertedCount = 0;

  try {
    await prisma.gitHubInstallation.update({
      where: { id: installationId },
      data: { lastSyncedAt: new Date() },
    });

    for (const repoRef of trackedRepos) {
      try {
        const repoResult = await syncRepository({
          octokit,
          repoRef,
          installationId,
          userId: syncUser.id,
          viewerLogin: syncUser.login,
        });

        pulledCount += repoResult.pulledCount;
        upsertedCount += repoResult.upsertedCount;
        errors.push(...repoResult.errors);
      } catch (error) {
        errors.push({
          repository: repoRef.fullName,
          message: error instanceof Error ? error.message : "Unknown repository sync error",
        });
      }
    }

    const status: "SUCCESS" | "PARTIAL" | "FAILED" =
      errors.length === 0 ? "SUCCESS" : upsertedCount > 0 ? "PARTIAL" : "FAILED";
    const finishedAt = new Date();

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status,
        finishedAt,
        pulledCount,
        upsertedCount,
        errorCount: errors.length,
        errorSummary: errors.length ? `${errors.length} error(s) during sync` : null,
        details: errors.length ? asInputJson({ errors }) : Prisma.JsonNull,
      },
    });

    return {
      runId: syncRun.id,
      trigger,
      status,
      pulledCount,
      upsertedCount,
      errorCount: errors.length,
      viewerLogin: syncUser.login,
      startedAt: syncRun.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      errors,
    };
  } catch (error) {
    const finishedAt = new Date();
    const failureMessage = error instanceof Error ? error.message : "Unknown sync error";

    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "FAILED",
        finishedAt,
        pulledCount,
        upsertedCount,
        errorCount: errors.length + 1,
        errorSummary: failureMessage,
        details: asInputJson({
          errors: [...errors, { repository: "*", message: failureMessage }],
        }),
      },
    });

    throw error;
  }
}
