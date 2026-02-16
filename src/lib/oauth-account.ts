import type { Account, Profile } from "next-auth";
import { getOAuthEnv } from "@/lib/env";
import { prisma } from "@/lib/db";
import { decryptToken, encryptToken } from "@/lib/crypto";

function getString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asDateFromUnixSeconds(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(value * 1000);
}

function asDateFromNowPlusSeconds(value: number | null | undefined): Date | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return new Date(Date.now() + value * 1000);
}

function extractGitHubIdentity(account: Account, profile: Profile): {
  githubId: bigint;
  login: string;
  nodeId: string | null;
  avatarUrl: string | null;
  name: string | null;
  email: string | null;
} {
  const profileRecord = profile as Record<string, unknown>;
  const providerAccountId = getString(account.providerAccountId);
  const profileId = getString(profileRecord.id);
  const rawGitHubId = profileId ?? providerAccountId;

  if (!rawGitHubId) {
    throw new Error("Missing GitHub account identifier");
  }

  const login = getString(profileRecord.login);
  if (!login) {
    throw new Error("Missing GitHub login from profile");
  }

  return {
    githubId: BigInt(rawGitHubId),
    login,
    nodeId: getString(profileRecord.node_id),
    avatarUrl: getString(profileRecord.avatar_url),
    name: getString(profile.name),
    email: getString(profile.email),
  };
}

export interface UpsertGitHubOAuthAccountResult {
  userId: string;
  login: string;
}

export async function upsertGitHubUserAndOAuthAccount(params: {
  account: Account;
  profile: Profile;
}): Promise<UpsertGitHubOAuthAccountResult> {
  const { account, profile } = params;

  if (account.provider !== "github") {
    throw new Error(`Unsupported OAuth provider: ${account.provider}`);
  }

  const identity = extractGitHubIdentity(account, profile);
  const providerAccountId = getString(account.providerAccountId);
  if (!providerAccountId) {
    throw new Error("Missing provider account id");
  }

  const accessToken = getString(account.access_token);
  const refreshToken = getString(account.refresh_token);
  const accountRecord = account as Record<string, unknown>;
  const refreshTokenExpiresIn =
    typeof accountRecord.refresh_token_expires_in === "number" &&
    Number.isFinite(accountRecord.refresh_token_expires_in)
      ? accountRecord.refresh_token_expires_in
      : null;

  const encryptedAccessToken = accessToken ? encryptToken(accessToken) : null;
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.upsert({
      where: { githubId: identity.githubId },
      create: {
        githubId: identity.githubId,
        githubNodeId: identity.nodeId,
        login: identity.login,
        name: identity.name,
        email: identity.email,
        image: identity.avatarUrl,
        avatarUrl: identity.avatarUrl,
      },
      update: {
        githubNodeId: identity.nodeId,
        login: identity.login,
        name: identity.name,
        email: identity.email,
        image: identity.avatarUrl,
        avatarUrl: identity.avatarUrl,
      },
    });

    await tx.oAuthAccount.upsert({
      where: {
        provider_providerAccountId: {
          provider: account.provider,
          providerAccountId,
        },
      },
      create: {
        userId: user.id,
        provider: account.provider,
        providerAccountId,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        accessTokenExpiresAt: asDateFromUnixSeconds(account.expires_at),
        refreshTokenExpiresAt: asDateFromNowPlusSeconds(refreshTokenExpiresIn),
        scope: getString(account.scope),
        tokenType: getString(account.token_type),
      },
      update: {
        userId: user.id,
        accessTokenEncrypted: encryptedAccessToken,
        refreshTokenEncrypted: encryptedRefreshToken,
        accessTokenExpiresAt: asDateFromUnixSeconds(account.expires_at),
        refreshTokenExpiresAt: asDateFromNowPlusSeconds(refreshTokenExpiresIn),
        scope: getString(account.scope),
        tokenType: getString(account.token_type),
      },
    });

    return user;
  });

  return {
    userId: result.id,
    login: result.login,
  };
}

export async function updateOAuthAccountTokens(params: {
  provider: string;
  userId?: string;
  providerAccountId?: string;
  accessToken: string;
  refreshToken?: string | null;
  accessTokenExpiresAt?: Date | null;
  refreshTokenExpiresAt?: Date | null;
  scope?: string | null;
  tokenType?: string | null;
}): Promise<void> {
  const provider = getString(params.provider);
  if (!provider) {
    throw new Error("OAuth provider is required");
  }

  const providerAccountId = getString(params.providerAccountId);
  const userId = getString(params.userId);

  if (!providerAccountId && !userId) {
    throw new Error("Either providerAccountId or userId must be provided");
  }

  const where = providerAccountId
    ? {
        provider_providerAccountId: {
          provider,
          providerAccountId,
        },
      }
    : {
        userId_provider: {
          userId: userId as string,
          provider,
        },
      };

  await prisma.oAuthAccount.update({
    where,
    data: {
      accessTokenEncrypted: encryptToken(params.accessToken),
      refreshTokenEncrypted: getString(params.refreshToken)
        ? encryptToken(params.refreshToken as string)
        : null,
      accessTokenExpiresAt: params.accessTokenExpiresAt ?? null,
      refreshTokenExpiresAt: params.refreshTokenExpiresAt ?? null,
      scope: getString(params.scope) ?? null,
      tokenType: getString(params.tokenType) ?? null,
    },
  });
}

export async function getOAuthAccessTokenForUser(params: {
  userId: string;
  provider?: string;
}): Promise<string> {
  const provider = params.provider ?? "github";
  const account = await prisma.oAuthAccount.findUnique({
    where: {
      userId_provider: {
        userId: params.userId,
        provider,
      },
    },
    select: {
      providerAccountId: true,
      accessTokenEncrypted: true,
      refreshTokenEncrypted: true,
      accessTokenExpiresAt: true,
      refreshTokenExpiresAt: true,
      scope: true,
      tokenType: true,
    },
  });

  if (!account?.accessTokenEncrypted) {
    throw new Error(`No OAuth access token stored for provider ${provider}`);
  }

  const token = decryptToken(account.accessTokenEncrypted);
  const expiresAt = account.accessTokenExpiresAt?.getTime() ?? null;
  const needsRefresh = expiresAt !== null && expiresAt <= Date.now() + 60_000;

  if (!needsRefresh) {
    return token;
  }

  if (!account.refreshTokenEncrypted) {
    throw new Error(
      "GitHub OAuth access token expired and no refresh token is stored. Re-authentication required.",
    );
  }

  const refreshExpiresAt = account.refreshTokenExpiresAt?.getTime() ?? null;
  if (refreshExpiresAt !== null && refreshExpiresAt <= Date.now()) {
    throw new Error("GitHub OAuth refresh token expired. Re-authentication required.");
  }

  const refreshToken = decryptToken(account.refreshTokenEncrypted);
  const oauthEnv = getOAuthEnv();
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: oauthEnv.clientId,
      client_secret: oauthEnv.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
    token_type?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const errorDetails = payload.error_description ?? payload.error ?? "unknown refresh error";
    throw new Error(`Unable to refresh GitHub OAuth token: ${errorDetails}`);
  }

  const nextAccessToken = payload.access_token;
  const nextRefreshToken = payload.refresh_token ?? refreshToken;
  const nextAccessTokenExpiresAt =
    typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
      ? new Date(Date.now() + payload.expires_in * 1000)
      : account.accessTokenExpiresAt;
  const nextRefreshTokenExpiresAt =
    typeof payload.refresh_token_expires_in === "number" &&
    Number.isFinite(payload.refresh_token_expires_in)
      ? new Date(Date.now() + payload.refresh_token_expires_in * 1000)
      : account.refreshTokenExpiresAt;

  await updateOAuthAccountTokens({
    provider,
    userId: params.userId,
    providerAccountId: account.providerAccountId,
    accessToken: nextAccessToken,
    refreshToken: nextRefreshToken,
    accessTokenExpiresAt: nextAccessTokenExpiresAt,
    refreshTokenExpiresAt: nextRefreshTokenExpiresAt,
    scope: payload.scope ?? account.scope,
    tokenType: payload.token_type ?? account.tokenType,
  });

  return nextAccessToken;
}
