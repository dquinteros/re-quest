import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeActionLog } from "@/lib/action-log";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  refreshAttentionForStoredPullRequest,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const reviewersSchema = z
  .object({
    reviewers: z.array(z.string().trim().min(1)).optional(),
    teamReviewers: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const reviewerCount = value.reviewers?.length ?? 0;
    const teamCount = value.teamReviewers?.length ?? 0;

    if (reviewerCount + teamCount === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "At least one reviewer or team reviewer is required",
      });
    }
  });

function uniqueValues(values: string[] | undefined): string[] {
  if (!values) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(value);
  }

  return normalized;
}

function extractRequestedReviewers(data: {
  requested_reviewers?: Array<{ login?: string | null } | null> | null;
  requested_teams?: Array<{ slug?: string | null } | null> | null;
}): string[] {
  const users = (data.requested_reviewers ?? [])
    .map((reviewer) => reviewer?.login)
    .filter((login): login is string => Boolean(login));

  const teams = (data.requested_teams ?? [])
    .map((team) => team?.slug)
    .filter((slug): slug is string => Boolean(slug))
    .map((slug) => `team:${slug}`);

  return [...users, ...teams];
}

async function parseBody(request: Request): Promise<z.infer<typeof reviewersSchema>> {
  return reviewersSchema.parse(await request.json());
}

async function authenticate(request: Request): Promise<AuthenticatedSessionUser> {
  return requireAuthenticatedSessionUser(request);
}

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
  try {
    sessionUser = await authenticate(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to authenticate request",
      error instanceof Error ? error.message : "Unknown auth error",
      500,
    );
  }

  const { id } = await resolveRouteParams(context);
  const prContext = await getPullRequestGitHubContext(id, sessionUser.id);

  if (!prContext) {
    return fail("Pull request not found", undefined, 404);
  }

  let payload: z.infer<typeof reviewersSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const reviewers = uniqueValues(payload.reviewers);
  const teamReviewers = uniqueValues(payload.teamReviewers);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.pulls.requestReviewers({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.number,
      ...(reviewers.length ? { reviewers } : {}),
      ...(teamReviewers.length ? { team_reviewers: teamReviewers } : {}),
    });

    const requestedReviewers = extractRequestedReviewers(response.data);

    await prisma.pullRequest.update({
      where: { id },
      data: {
        requestedReviewers,
        reviewState: requestedReviewers.length > 0 ? "REVIEW_REQUESTED" : undefined,
        githubUpdatedAt: new Date(response.data.updated_at),
        lastActivityAt: new Date(response.data.updated_at),
      },
    });

    await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

    await writeActionLog({
      actionType: "UPDATE_REVIEWERS",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", reviewers, teamReviewers },
    });

    return ok({ requestedReviewers });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_REVIEWERS",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", reviewers, teamReviewers },
      errorMessage: error instanceof Error ? error.message : "Unknown reviewer update error",
    });

    return fail(
      "Failed to request reviewers",
      error instanceof Error ? error.message : "Unknown reviewer update error",
      502,
    );
  }
}

export async function DELETE(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
  try {
    sessionUser = await authenticate(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to authenticate request",
      error instanceof Error ? error.message : "Unknown auth error",
      500,
    );
  }

  const { id } = await resolveRouteParams(context);
  const prContext = await getPullRequestGitHubContext(id, sessionUser.id);

  if (!prContext) {
    return fail("Pull request not found", undefined, 404);
  }

  let payload: z.infer<typeof reviewersSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const reviewers = uniqueValues(payload.reviewers);
  const teamReviewers = uniqueValues(payload.teamReviewers);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.pulls.removeRequestedReviewers({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.number,
      reviewers,
      ...(teamReviewers.length ? { team_reviewers: teamReviewers } : {}),
    });

    const requestedReviewers = extractRequestedReviewers(response.data);

    await prisma.pullRequest.update({
      where: { id },
      data: {
        requestedReviewers,
        githubUpdatedAt: new Date(response.data.updated_at),
        lastActivityAt: new Date(response.data.updated_at),
      },
    });

    await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

    await writeActionLog({
      actionType: "UPDATE_REVIEWERS",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", reviewers, teamReviewers },
    });

    return ok({ requestedReviewers });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_REVIEWERS",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", reviewers, teamReviewers },
      errorMessage: error instanceof Error ? error.message : "Unknown reviewer update error",
    });

    return fail(
      "Failed to remove reviewers",
      error instanceof Error ? error.message : "Unknown reviewer update error",
      502,
    );
  }
}
