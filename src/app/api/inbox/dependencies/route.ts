import { z } from "zod";
import { fail, ok } from "@/lib/http";
import { requireAuthenticatedSessionUser, AuthenticationError } from "@/lib/pr-mutations";
import { listDependencyPullRequests, type ParsedDependencyQuery } from "@/lib/pr-store";

function listParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

const schema = z.object({
  repo: z.array(z.string()).default([]),
  author: z.array(z.string()).default([]),
  ciState: z
    .array(z.enum(["SUCCESS", "FAILURE", "PENDING", "UNKNOWN"]).catch("UNKNOWN"))
    .default([]),
  assigned: z.enum(["true", "false", "all"]).default("all"),
  sort: z.enum(["urgency", "updated_desc", "updated_asc", "repo"]).default("repo"),
});

function parseDependencyQuery(searchParams: URLSearchParams): ParsedDependencyQuery {
  return schema.parse({
    repo: listParam(searchParams.get("repo")),
    author: listParam(searchParams.get("author")),
    ciState: listParam(searchParams.get("ciState")),
    assigned: searchParams.get("assigned") ?? "all",
    sort: searchParams.get("sort") ?? "repo",
  });
}

export async function GET(request: Request) {
  try {
    const sessionUser = await requireAuthenticatedSessionUser(request);
    const query = parseDependencyQuery(new URL(request.url).searchParams);
    const result = await listDependencyPullRequests(query, {
      userId: sessionUser.id,
      userLogin: sessionUser.login,
    });
    return ok(result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to load dependency pull requests",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
