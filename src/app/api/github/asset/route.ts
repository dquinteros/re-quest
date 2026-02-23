import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";

const ALLOWED_HOSTS = new Set([
  "github.com",
  "www.github.com",
  "raw.githubusercontent.com",
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
  "media.githubusercontent.com",
]);

function errorText(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function isAllowedGithubAssetUrl(input: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") {
    return false;
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.has(host)) {
    return false;
  }

  if (host === "github.com" || host === "www.github.com") {
    return parsed.pathname.startsWith("/user-attachments/assets/");
  }

  return true;
}

async function fetchGitHubAsset(url: string, token: string): Promise<Response> {
  const acceptHeader = "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8";

  const withAuth = await fetch(url, {
    headers: {
      Accept: acceptHeader,
      Authorization: `Bearer ${token}`,
      "User-Agent": "re-quest/asset-proxy",
    },
    redirect: "follow",
    cache: "no-store",
  });

  if (withAuth.ok) {
    return withAuth;
  }

  if (withAuth.status !== 401 && withAuth.status !== 403 && withAuth.status !== 404) {
    return withAuth;
  }

  return fetch(url, {
    headers: {
      Accept: acceptHeader,
      "User-Agent": "re-quest/asset-proxy",
    },
    redirect: "follow",
    cache: "no-store",
  });
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
      return errorText("Unauthorized", 401);
    }
    return errorText(
      error instanceof Error ? error.message : "Unknown auth error",
      500,
    );
  }

  const requestUrl = new URL(request.url);
  const targetUrl = requestUrl.searchParams.get("url");
  if (!targetUrl || !isAllowedGithubAssetUrl(targetUrl)) {
    return errorText("Invalid or unsupported asset URL", 400);
  }

  let upstream: Response;
  try {
    upstream = await fetchGitHubAsset(targetUrl, sessionUser.githubToken);
  } catch (error) {
    return errorText(
      error instanceof Error ? error.message : "Failed to load asset",
      502,
    );
  }

  if (!upstream.ok) {
    return errorText(`Failed to load asset (${upstream.status})`, 502);
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
  const contentDisposition = upstream.headers.get("content-disposition") ?? "inline";
  const contentLength = upstream.headers.get("content-length");
  const etag = upstream.headers.get("etag");
  const lastModified = upstream.headers.get("last-modified");

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": contentDisposition,
    "Cache-Control": "private, max-age=300",
  });

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  if (etag) {
    headers.set("ETag", etag);
  }
  if (lastModified) {
    headers.set("Last-Modified", lastModified);
  }

  return new Response(upstream.body, {
    status: 200,
    headers,
  });
}
