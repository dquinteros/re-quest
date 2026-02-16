import { spawn } from "node:child_process";
import { updateActionLogStatus, writeActionLog } from "@/lib/action-log";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser;
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

  const prUrl = `https://github.com/${prContext.owner}/${prContext.repo}/pull/${prContext.number}`;

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const logId = await writeActionLog({
      actionType: "AI_REVIEW",
      resultStatus: "RUNNING",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { prUrl },
    });

    const child = spawn("npx", ["ai-pr-reviewer", prUrl], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    });

    child.on("close", (code) => {
      const status = code === 0 ? "SUCCESS" : "FAILED";
      const errorMsg = code !== 0 ? `Process exited with code ${code}` : undefined;
      updateActionLogStatus(logId, status, errorMsg).catch(() => {
        /* best-effort update */
      });
    });

    child.on("error", (err) => {
      updateActionLogStatus(logId, "FAILED", err.message).catch(() => {
        /* best-effort update */
      });
    });

    child.unref();

    return ok({ message: "AI review started", prUrl, logId }, 202);
  } catch (error) {
    await writeActionLog({
      actionType: "AI_REVIEW",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { prUrl },
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to start AI review",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
