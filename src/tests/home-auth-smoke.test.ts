// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/pr-attention-manager", () => ({
  PrAttentionManager: ({ viewerLabel }: { viewerLabel?: string | null }) =>
    React.createElement(
      "section",
      { "data-testid": "triage-shell" },
      viewerLabel ? `viewer:${viewerLabel}` : "viewer:none",
    ),
}));

import Home from "@/app/page";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("Home auth smoke flow", () => {
  it("renders unauthenticated state when session endpoint returns unauthorized", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401, statusText: "Unauthorized" }));
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /github/i })).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/session",
      expect.objectContaining({
        cache: "no-store",
        credentials: "include",
      }),
    );
  });

  it("renders triage container when the session is authenticated", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        authenticated: true,
        user: {
          login: "octocat",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(React.createElement(Home));

    await waitFor(() => {
      expect(screen.getByTestId("triage-shell")).toBeTruthy();
      expect(screen.getByTestId("triage-shell").textContent).toContain("octocat");
    });
  });
});
