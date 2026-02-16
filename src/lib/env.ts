import { z } from "zod";

const baseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GITHUB_CLIENT_ID: z.string().min(1, "GITHUB_CLIENT_ID is required"),
  GITHUB_CLIENT_SECRET: z.string().min(1, "GITHUB_CLIENT_SECRET is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  TOKEN_ENCRYPTION_KEY: z.string().min(1, "TOKEN_ENCRYPTION_KEY is required"),
  ALLOWED_GITHUB_LOGINS: z.string().default(""),
  GITHUB_REPOSITORIES: z.string().default(""),
  SYNC_INTERVAL_SECONDS: z.coerce.number().int().min(15).default(60),
});

const baseParsed = baseEnvSchema.safeParse(process.env);
if (!baseParsed.success) {
  throw new Error(`Environment validation failed: ${baseParsed.error.message}`);
}

export const env = baseParsed.data;

export interface OAuthEnv {
  clientId: string;
  clientSecret: string;
}

export interface GitHubEnv {
  appId: string;
  privateKey: string;
  installationId: number;
}

export function getOAuthEnv(): OAuthEnv {
  return {
    clientId: env.GITHUB_CLIENT_ID,
    clientSecret: env.GITHUB_CLIENT_SECRET,
  };
}

export function getGitHubEnv(): GitHubEnv {
  // Compatibility helper for legacy call-sites still expecting app fields.
  // Values are optional and not validated to avoid runtime dependency on GITHUB_APP_*.
  const rawInstallationId = process.env.GITHUB_APP_INSTALLATION_ID ?? "0";
  const installationId = Number(rawInstallationId);
  return {
    appId: process.env.GITHUB_APP_ID ?? "",
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    installationId: Number.isFinite(installationId) ? installationId : 0,
  };
}

function parseDelimitedList(raw: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];

  for (const token of raw.split(/[\n,]/g)) {
    const normalized = token.trim();
    if (!normalized) {
      continue;
    }

    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    values.push(normalized);
  }

  return values;
}

export function getAllowedGitHubLogins(): string[] {
  return parseDelimitedList(env.ALLOWED_GITHUB_LOGINS).map((login) =>
    login.toLowerCase(),
  );
}

export function isAllowedGitHubLogin(login: string): boolean {
  const normalized = login.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const allowed = getAllowedGitHubLogins();
  return allowed.includes(normalized);
}

export function getTrackedRepositories(): string[] {
  return parseDelimitedList(env.GITHUB_REPOSITORIES);
}
