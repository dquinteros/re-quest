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

const assigneesSchema = z
  .object({
    assignees: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

function uniqueValues(values: string[]): string[] {
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

async function parseBody(request: Request): Promise<z.infer<typeof assigneesSchema>> {
  return assigneesSchema.parse(await request.json());
}

function issueAssigneesToLogins(issue: {
  assignees?: Array<{ login?: string | null } | null> | null;
}): string[] {
  return (issue.assignees ?? [])
    .map((assignee) => assignee?.login)
    .filter((login): login is string => Boolean(login));
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

  let payload: z.infer<typeof assigneesSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const assignees = uniqueValues(payload.assignees);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.issues.addAssignees({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.number,
      assignees,
    });

    const allAssignees = issueAssigneesToLogins(response.data);

    await prisma.pullRequest.update({
      where: { id },
      data: {
        assignees: allAssignees,
        githubUpdatedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

    await writeActionLog({
      actionType: "UPDATE_ASSIGNEES",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", assignees },
    });

    return ok({ assignees: allAssignees });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_ASSIGNEES",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", assignees },
      errorMessage: error instanceof Error ? error.message : "Unknown assignee update error",
    });

    return fail(
      "Failed to add assignees",
      error instanceof Error ? error.message : "Unknown assignee update error",
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

  let payload: z.infer<typeof assigneesSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const assignees = uniqueValues(payload.assignees);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.issues.removeAssignees({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.number,
      assignees,
    });

    const allAssignees = issueAssigneesToLogins(response.data);

    await prisma.pullRequest.update({
      where: { id },
      data: {
        assignees: allAssignees,
        githubUpdatedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

    await writeActionLog({
      actionType: "UPDATE_ASSIGNEES",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", assignees },
    });

    return ok({ assignees: allAssignees });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_ASSIGNEES",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", assignees },
      errorMessage: error instanceof Error ? error.message : "Unknown assignee update error",
    });

    return fail(
      "Failed to remove assignees",
      error instanceof Error ? error.message : "Unknown assignee update error",
      502,
    );
  }
}
