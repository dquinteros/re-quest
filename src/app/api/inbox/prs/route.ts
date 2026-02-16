import { ZodError } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAuthenticatedSessionUser, AuthenticationError } from "@/lib/pr-mutations";
import { listInboxPullRequests } from "@/lib/pr-store";
import { parseInboxQuery } from "@/lib/query";

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuthenticatedSessionUser(request);
    const query = parseInboxQuery(new URL(request.url).searchParams);
    const inbox = await listInboxPullRequests(query, {
      userId: sessionUser.id,
      userLogin: sessionUser.login,
    });
    return ok(inbox);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    if (error instanceof ZodError) {
      return fail("Invalid query parameters", error.message, 400);
    }

    return fail(
      "Failed to load inbox pull requests",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
