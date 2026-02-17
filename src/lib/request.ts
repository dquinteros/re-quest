import type { ApiError } from "@/types/pr";

export async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const errorBody = (await response.json()) as ApiError;
    if (errorBody.error && errorBody.details) {
      return `${errorBody.error}: ${errorBody.details}`;
    }

    if (errorBody.error) {
      return errorBody.error;
    }
  } catch {
    // Ignore parsing failures and fall back to status text.
  }

  return `${response.status} ${response.statusText}`;
}

export async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  const text = await response.text();
  if (!text.trim()) {
    return undefined as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined as T;
  }
}

/**
 * Like `requestJson` but never throws.
 * Returns `{ data, error }` so components can handle failures without
 * try/catch boilerplate.
 */
export async function safeRequestJson<T>(
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const data = await requestJson<T>(path, init);
    return { data, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
