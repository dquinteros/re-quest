import type { RestEndpointMethodTypes } from "@octokit/rest";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  createOAuthUserOctokit,
  type AuthenticatedSessionUser,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import type { TrackedRepository } from "@/types/pr";

type AuthenticatedRepository =
  RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][number];

function toRepositoryRecord(repo: AuthenticatedRepository): TrackedRepository | null {
  const fullName = typeof repo.full_name === "string" ? repo.full_name.trim() : "";
  const [owner = "", name = ""] = fullName.split("/", 2);
  if (!owner || !name) {
    return null;
  }

  return {
    fullName,
    owner,
    name,
  };
}

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
    const octokit = createOAuthUserOctokit(sessionUser.githubToken);
    const repositories = await octokit.paginate(
      octokit.rest.repos.listForAuthenticatedUser,
      {
        visibility: "all",
        affiliation: "owner,collaborator,organization_member",
        per_page: 100,
        sort: "full_name",
        direction: "asc",
      },
    );

    const deduped = new Map<string, TrackedRepository>();
    for (const repository of repositories) {
      const normalized = toRepositoryRecord(repository);
      if (!normalized) {
        continue;
      }

      deduped.set(normalized.fullName.toLowerCase(), normalized);
    }

    return ok({
      repositories: Array.from(deduped.values()).sort((left, right) =>
        left.fullName.localeCompare(right.fullName),
      ),
    });
  } catch (error) {
    return fail(
      "Failed to load available repositories",
      error instanceof Error ? error.message : "Unknown repository list error",
      502,
    );
  }
}
