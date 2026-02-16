import { writeActionLog } from "@/lib/action-log";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { getPullRequestDetail } from "@/lib/pr-store";
import { syncSinglePullRequest } from "@/lib/sync-service";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
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

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    await syncSinglePullRequest({
      octokit,
      owner: prContext.owner,
      repo: prContext.repo,
      pullNumber: prContext.number,
      repositoryId: prContext.repositoryId,
      viewerLogin,
    });

    const detail = await getPullRequestDetail(id, {
      userId: sessionUser.id,
      userLogin: sessionUser.login,
    });

    await writeActionLog({
      actionType: "REFRESH_PR",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ pullRequest: detail });
  } catch (error) {
    await writeActionLog({
      actionType: "REFRESH_PR",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown refresh error",
    });

    return fail(
      "Failed to refresh pull request",
      error instanceof Error ? error.message : "Unknown refresh error",
      502,
    );
  }
}
