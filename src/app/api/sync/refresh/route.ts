import { writeActionLog } from "@/lib/action-log";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { runSync } from "@/lib/sync-service";

export async function POST(request: Request) {
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

  try {
    const result = await runSync({
      trigger: "MANUAL",
      user: {
        id: sessionUser.id,
        login: sessionUser.login,
        githubId: sessionUser.githubId,
        githubToken: sessionUser.githubToken,
      },
    });

    await writeActionLog({
      actionType: "SYNC_MANUAL",
      resultStatus: "SUCCESS",
      repository: "*",
      actorLogin: result.viewerLogin,
      payload: {
        runId: result.runId,
        status: result.status,
        pulledCount: result.pulledCount,
        upsertedCount: result.upsertedCount,
        errorCount: result.errorCount,
      },
    });

    return ok({ sync: result }, 202);
  } catch (error) {
    await writeActionLog({
      actionType: "SYNC_MANUAL",
      resultStatus: "FAILED",
      repository: "*",
      actorLogin: sessionUser.login,
      errorMessage: error instanceof Error ? error.message : "Unknown sync error",
    });

    return fail(
      "Failed to refresh sync",
      error instanceof Error ? error.message : "Unknown sync error",
      500,
    );
  }
}
