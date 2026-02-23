import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { normalizeAppSettings } from "@/lib/settings";
import { getUserSettings, upsertUserSettings } from "@/lib/settings.server";

export async function GET(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail(
      "Failed to authenticate",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }

  try {
    const settings = await getUserSettings(sessionUser.id);
    return ok(settings);
  } catch (error) {
    return fail(
      "Failed to load settings",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function PUT(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail(
      "Failed to authenticate",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail("Invalid JSON body", undefined, 400);
  }

  try {
    const normalized = normalizeAppSettings(body);
    const saved = await upsertUserSettings(sessionUser.id, normalized);
    return ok(saved);
  } catch (error) {
    return fail(
      "Failed to save settings",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
