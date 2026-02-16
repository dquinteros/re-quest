import { Octokit } from "@octokit/rest";
import { prisma } from "@/lib/db";
import { getOAuthAccessTokenForUser } from "@/lib/oauth-account";
import { upsertAttentionState } from "@/lib/pr-attention";
import { requireAuthenticatedUser } from "@/lib/session-auth";

export interface AuthenticatedSessionUser {
  id: string;
  login: string;
  githubId: bigint;
  githubToken: string;
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export interface PullRequestGitHubContext {
  id: string;
  repositoryId: string;
  number: number;
  fullName: string;
  owner: string;
  repo: string;
}

export function createOAuthUserOctokit(token: string): Octokit {
  return new Octokit({ auth: token });
}

export function parseFullName(fullName: string): { owner: string; repo: string } {
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) {
    throw new Error(`Invalid repository full name: ${fullName}`);
  }

  return { owner, repo };
}

export function stringArrayFromUnknown(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export async function requireAuthenticatedSessionUser(
  request: Request,
): Promise<AuthenticatedSessionUser> {
  void request;
  const sessionUser = await requireAuthenticatedUser();

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { githubId: true, login: true },
  });

  if (!user?.githubId) {
    throw new AuthenticationError("Authenticated user is missing GitHub identity");
  }

  let githubToken: string;
  try {
    githubToken = await getOAuthAccessTokenForUser({ userId: sessionUser.id });
  } catch (error) {
    throw new AuthenticationError(
      error instanceof Error
        ? error.message
        : "OAuth token unavailable. Sign in again.",
    );
  }

  return {
    id: sessionUser.id,
    login: user.login,
    githubId: user.githubId,
    githubToken,
  };
}

export async function getPullRequestGitHubContext(
  id: string,
  userId: string,
): Promise<PullRequestGitHubContext | null> {
  const pullRequest = await prisma.pullRequest.findFirst({
    where: {
      id,
      OR: [
        { repository: { userId } },
        { repository: { installation: { userId } } },
      ],
    },
    include: {
      repository: true,
    },
  });

  if (!pullRequest) {
    return null;
  }

  const parsed = parseFullName(pullRequest.repository.fullName);

  return {
    id: pullRequest.id,
    repositoryId: pullRequest.repositoryId,
    number: pullRequest.number,
    fullName: pullRequest.repository.fullName,
    owner: parsed.owner,
    repo: parsed.repo,
  };
}

export async function refreshAttentionForStoredPullRequest(
  pullRequestId: string,
  viewerLogin: string | null,
  userId?: string,
): Promise<void> {
  const pullRequest = await prisma.pullRequest.findFirst({
    where: {
      id: pullRequestId,
      ...(userId
        ? {
            OR: [
              { repository: { userId } },
              { repository: { installation: { userId } } },
            ],
          }
        : {}),
    },
  });

  if (!pullRequest) {
    throw new Error(`Pull request not found: ${pullRequestId}`);
  }

  await upsertAttentionState({
    pullRequestId: pullRequest.id,
    reviewState: pullRequest.reviewState,
    ciState: pullRequest.ciState,
    isDraft: pullRequest.draft,
    updatedAt: pullRequest.githubUpdatedAt,
    createdAt: pullRequest.githubCreatedAt,
    isMergeable: pullRequest.mergeable,
    additions: pullRequest.additions,
    deletions: pullRequest.deletions,
    commentCount: pullRequest.commentCount,
    commitCount: pullRequest.commitCount,
    labels: stringArrayFromUnknown(pullRequest.labels),
    assignees: stringArrayFromUnknown(pullRequest.assignees),
    requestedReviewers: stringArrayFromUnknown(pullRequest.requestedReviewers),
    body: pullRequest.body,
    viewerLogin,
  });
}
