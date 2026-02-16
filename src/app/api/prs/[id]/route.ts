import { z } from "zod";
import { prisma } from "@/lib/db";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  refreshAttentionForStoredPullRequest,
  requireAuthenticatedSessionUser,
  stringArrayFromUnknown,
} from "@/lib/pr-mutations";
import { getPullRequestDetail } from "@/lib/pr-store";
import { writeActionLog } from "@/lib/action-log";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const patchPullRequestSchema = z
  .object({
    title: z.string().min(1).optional(),
    body: z.string().nullable().optional(),
    state: z.enum(["open", "closed"]).optional(),
    milestoneNumber: z.number().int().nullable().optional(),
    projectIds: z.array(z.string().trim().min(1)).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.title !== undefined ||
      data.body !== undefined ||
      data.state !== undefined ||
      data.milestoneNumber !== undefined ||
      data.projectIds !== undefined,
    {
      message: "At least one mutable field is required",
    },
  );

function toPullRequestState(state: "open" | "closed", mergedAt: string | null): "OPEN" | "CLOSED" | "MERGED" {
  if (mergedAt) {
    return "MERGED";
  }

  return state === "closed" ? "CLOSED" : "OPEN";
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

async function authenticate(request: Request): Promise<AuthenticatedSessionUser> {
  return requireAuthenticatedSessionUser(request);
}

export async function GET(
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

  try {
    const { id } = await resolveRouteParams(context);
    const detail = await getPullRequestDetail(id, {
      userId: sessionUser.id,
      userLogin: sessionUser.login,
    });

    if (!detail) {
      return fail("Pull request not found", undefined, 404);
    }

    // Refresh the mergeable status from GitHub in the background.
    // We don't block the response on this; the next load will have fresh data.
    const prContext = await getPullRequestGitHubContext(id, sessionUser.id);
    if (prContext) {
      refreshMergeableStatus(sessionUser.githubToken, prContext, id).catch(() => {
        // Silently ignore - mergeable check is best-effort
      });
    }

    return ok(detail);
  } catch (error) {
    return fail(
      "Failed to load pull request",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

async function refreshMergeableStatus(
  githubToken: string,
  prContext: { owner: string; repo: string; number: number },
  id: string,
) {
  const octokit = createOAuthUserOctokit(githubToken);
  const { data } = await octokit.rest.pulls.get({
    owner: prContext.owner,
    repo: prContext.repo,
    pull_number: prContext.number,
  });

  if (typeof data.mergeable === "boolean") {
    await prisma.pullRequest.update({
      where: { id },
      data: { mergeable: data.mergeable },
    });
  }
}

export async function PATCH(
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

  let parsedBody: z.infer<typeof patchPullRequestSchema>;
  try {
    parsedBody = patchPullRequestSchema.parse(await request.json());
  } catch (error) {
    return fail(
      "Invalid request body",
      error instanceof Error ? error.message : "Unknown body parsing error",
      400,
    );
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.pulls.update({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.number,
      ...(parsedBody.title !== undefined ? { title: parsedBody.title } : {}),
      ...(parsedBody.body !== undefined ? { body: parsedBody.body ?? "" } : {}),
      ...(parsedBody.state !== undefined ? { state: parsedBody.state } : {}),
    });

    const labels = response.data.labels
      .map((label) => (typeof label === "string" ? label : label.name))
      .filter((label): label is string => Boolean(label));

    const assignees = (response.data.assignees ?? [])
      .map((assignee) => assignee.login)
      .filter((login): login is string => Boolean(login));

    const requestedReviewers = extractRequestedReviewers(response.data);

    let milestoneTitle = response.data.milestone?.title ?? null;

    if (parsedBody.milestoneNumber !== undefined) {
      const issueResponse = await octokit.rest.issues.update({
        owner: prContext.owner,
        repo: prContext.repo,
        issue_number: prContext.number,
        milestone: parsedBody.milestoneNumber === null ? 0 : parsedBody.milestoneNumber,
      });

      milestoneTitle = issueResponse.data.milestone?.title ?? null;
    }

    const existingProjects = stringArrayFromUnknown((await prisma.pullRequest.findFirst({
      where: {
        id,
        OR: [
          { repository: { userId: sessionUser.id } },
          {
            repository: {
              installation: {
                userId: sessionUser.id,
              },
            },
          },
        ],
      },
      select: { projects: true },
    }))?.projects);

    const projectIds = parsedBody.projectIds?.length
      ? Array.from(
          new Set([
            ...existingProjects,
            ...parsedBody.projectIds.map((projectId) => projectId.trim()).filter(Boolean),
          ]),
        )
      : existingProjects;

    if (parsedBody.projectIds?.length) {
      if (!response.data.node_id) {
        throw new Error("Cannot update project memberships: pull request node_id not available");
      }

      for (const projectId of parsedBody.projectIds) {
        await octokit.graphql<{ addProjectV2ItemById: { item: { id: string } } }>(
          `
            mutation AddProjectItem($projectId: ID!, $contentId: ID!) {
              addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
                item {
                  id
                }
              }
            }
          `,
          {
            projectId,
            contentId: response.data.node_id,
          },
        );
      }
    }

    await prisma.pullRequest.update({
      where: { id },
      data: {
        title: response.data.title,
        body: response.data.body,
        state: toPullRequestState(response.data.state, response.data.merged_at),
        draft: Boolean(response.data.draft),
        url: response.data.html_url,
        githubUpdatedAt: new Date(response.data.updated_at),
        lastActivityAt: new Date(response.data.updated_at),
        labels,
        assignees,
        requestedReviewers,
        milestone: milestoneTitle,
        projects: projectIds,
      },
    });

    await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

    const detail = await getPullRequestDetail(id, {
      userId: sessionUser.id,
      userLogin: sessionUser.login,
    });

    await writeActionLog({
      actionType: "UPDATE_PR",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
    });

    return ok({
      pullRequest: detail,
      changed: {
        title: parsedBody.title !== undefined,
        body: parsedBody.body !== undefined,
        state: parsedBody.state !== undefined,
        milestone: parsedBody.milestoneNumber !== undefined,
        projects: Boolean(parsedBody.projectIds?.length),
      },
    });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_PR",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
      errorMessage: error instanceof Error ? error.message : "Unknown update error",
    });

    return fail(
      "Failed to update pull request",
      error instanceof Error ? error.message : "Unknown update error",
      502,
    );
  }
}
