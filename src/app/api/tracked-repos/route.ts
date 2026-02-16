import { z } from "zod";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import {
  addTrackedRepositoryForUser,
  listTrackedRepositoriesForUser,
  removeTrackedRepositoryForUserByFullName,
} from "@/lib/sync-service";

const addTrackedRepositorySchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1)
      .regex(/^[^/\s]+\/[^/\s]+$/, "Repository must use owner/repo format"),
  })
  .strict();

const removeTrackedRepositorySchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1)
      .regex(/^[^/\s]+\/[^/\s]+$/, "Repository must use owner/repo format"),
  })
  .strict();

async function authenticate(request: Request): Promise<AuthenticatedSessionUser> {
  return requireAuthenticatedSessionUser(request);
}

export async function GET(request: Request) {
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
    const trackedRepos = await listTrackedRepositoriesForUser(sessionUser.id);
    return ok({ trackedRepos });
  } catch (error) {
    return fail(
      "Failed to load tracked repositories",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function POST(request: Request) {
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

  let payload: z.infer<typeof addTrackedRepositorySchema>;
  try {
    payload = addTrackedRepositorySchema.parse(await request.json());
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  try {
    const added = await addTrackedRepositoryForUser({
      user: {
        id: sessionUser.id,
        login: sessionUser.login,
        githubId: sessionUser.githubId,
        githubToken: sessionUser.githubToken,
      },
      fullName: payload.fullName,
    });

    const trackedRepos = await listTrackedRepositoriesForUser(sessionUser.id);

    return ok({
      trackedRepos,
      added,
    }, 201);
  } catch (error) {
    return fail(
      "Failed to track repository",
      error instanceof Error ? error.message : "Unknown tracking error",
      502,
    );
  }
}

// Backward-compatible delete contract: DELETE /api/tracked-repos with { fullName }.
export async function DELETE(request: Request) {
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

  let payload: z.infer<typeof removeTrackedRepositorySchema>;
  try {
    payload = removeTrackedRepositorySchema.parse(await request.json());
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  try {
    const removed = await removeTrackedRepositoryForUserByFullName({
      userId: sessionUser.id,
      fullName: payload.fullName,
    });

    const trackedRepos = await listTrackedRepositoriesForUser(sessionUser.id);

    return ok({
      trackedRepos,
      removed,
    });
  } catch (error) {
    return fail(
      "Failed to untrack repository",
      error instanceof Error ? error.message : "Unknown tracking error",
      500,
    );
  }
}
