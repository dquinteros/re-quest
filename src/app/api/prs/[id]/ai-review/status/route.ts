import { getLatestActionLog, updateActionLogStatus } from "@/lib/action-log";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const STALE_RUNNING_THRESHOLD_MS = 10 * 60 * 1000;

export type AiReviewStatus = "idle" | "running" | "success" | "failed";

export interface AiReviewStatusResponse {
  status: AiReviewStatus;
  startedAt: string | null;
}

export async function GET(
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

  const latest = await getLatestActionLog(
    "AI_REVIEW",
    prContext.fullName,
    prContext.number,
  );

  if (!latest) {
    return ok<AiReviewStatusResponse>({ status: "idle", startedAt: null });
  }

  if (latest.resultStatus === "RUNNING") {
    const elapsed = Date.now() - latest.createdAt.getTime();
    if (elapsed > STALE_RUNNING_THRESHOLD_MS) {
      await updateActionLogStatus(
        latest.id,
        "FAILED",
        "Process timed out (no exit signal received)",
      );
      return ok<AiReviewStatusResponse>({
        status: "failed",
        startedAt: latest.createdAt.toISOString(),
      });
    }

    return ok<AiReviewStatusResponse>({
      status: "running",
      startedAt: latest.createdAt.toISOString(),
    });
  }

  const status: AiReviewStatus =
    latest.resultStatus === "SUCCESS" ? "success" : "failed";

  return ok<AiReviewStatusResponse>({
    status,
    startedAt: latest.createdAt.toISOString(),
  });
}
