import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";
import {
  listTrackedRepositoriesForUser,
  removeTrackedRepositoryForUserById,
} from "@/lib/sync-service";

async function authenticate(request: Request): Promise<AuthenticatedSessionUser> {
  return requireAuthenticatedSessionUser(request);
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

  try {
    const removed = await removeTrackedRepositoryForUserById({
      userId: sessionUser.id,
      id,
    });

    if (!removed) {
      return fail("Tracked repository not found", undefined, 404);
    }

    const trackedRepos = await listTrackedRepositoriesForUser(sessionUser.id);
    return ok({ trackedRepos, removed });
  } catch (error) {
    return fail(
      "Failed to untrack repository",
      error instanceof Error ? error.message : "Unknown tracking error",
      500,
    );
  }
}
