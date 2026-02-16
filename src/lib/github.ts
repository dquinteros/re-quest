import { graphql } from "@octokit/graphql";
import { Octokit } from "@octokit/rest";
import { getTrackedRepositories } from "@/lib/env";
import { getOAuthAccessTokenForUser } from "@/lib/oauth-account";

export interface RepoRef {
  owner: string;
  repo: string;
  fullName: string;
}

export function parseRepositoryFullName(entry: string): RepoRef {
  const [owner, repo] = entry.split("/").map((part) => part.trim());
  if (!owner || !repo) {
    throw new Error(`Invalid repository format: ${entry}. Use owner/repo.`);
  }

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
  };
}

export function getTrackedRepoRefs(): RepoRef[] {
  return getTrackedRepositories().map(parseRepositoryFullName);
}

function buildAuthHeader(accessToken: string): string {
  const token = accessToken.trim();
  if (!token) {
    throw new Error("GitHub access token is required");
  }

  return `Bearer ${token}`;
}

export function getOctokitForAccessToken(accessToken: string): Octokit {
  return new Octokit({
    auth: accessToken,
  });
}

export function getGraphqlForAccessToken(accessToken: string) {
  return graphql.defaults({
    headers: {
      authorization: buildAuthHeader(accessToken),
    },
  });
}

export async function getUserOctokit(userId: string): Promise<Octokit> {
  const accessToken = await getOAuthAccessTokenForUser({
    userId,
    provider: "github",
  });
  return getOctokitForAccessToken(accessToken);
}

export async function getUserGraphql(userId: string) {
  const accessToken = await getOAuthAccessTokenForUser({
    userId,
    provider: "github",
  });
  return getGraphqlForAccessToken(accessToken);
}

export function getInstallationOctokit(accessToken?: string): Octokit {
  if (!accessToken) {
    return new Octokit();
  }

  return getOctokitForAccessToken(accessToken);
}

export function getInstallationGraphql(accessToken?: string) {
  if (!accessToken) {
    return graphql.defaults({});
  }

  return getGraphqlForAccessToken(accessToken);
}

export async function getInstallationAuthToken(): Promise<string> {
  throw new Error(
    "Installation tokens are not supported after OAuth migration. Use user OAuth access tokens.",
  );
}

export async function getViewerLogin(octokit: Octokit): Promise<string | null> {
  try {
    const me = await octokit.rest.users.getAuthenticated();
    return me.data.login;
  } catch {
    return null;
  }
}

export function mapCombinedStatusToCiState(
  status: "failure" | "pending" | "success" | "unknown",
): "SUCCESS" | "FAILURE" | "PENDING" | "UNKNOWN" {
  if (status === "failure") {
    return "FAILURE";
  }

  if (status === "pending") {
    return "PENDING";
  }

  if (status === "unknown") {
    return "UNKNOWN";
  }

  return "SUCCESS";
}
