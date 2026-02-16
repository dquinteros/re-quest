"use client";

import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { PrAttentionManager } from "@/components/pr-attention-manager";
import { useTheme } from "@/hooks/use-theme";
import type { AuthSessionResponse, AuthUser } from "@/types/pr";

const SESSION_ENDPOINT = "/api/auth/session";
const SIGN_IN_ENDPOINT = "/api/auth/signin/github";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

const shellStyle: CSSProperties = {
  minHeight: "100dvh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "clamp(1rem, 4vw, 2.5rem)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: "44rem",
  borderRadius: "1rem",
  border: "1px solid hsl(var(--border))",
  background:
    "linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--muted) / 0.55) 100%)",
  boxShadow: "0 20px 50px hsl(var(--foreground) / 0.16)",
  padding: "clamp(1.25rem, 3.5vw, 2rem)",
  display: "grid",
  gap: "1rem",
};

const headingStyle: CSSProperties = {
  display: "grid",
  gap: "0.5rem",
};

const eyebrowStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  padding: "0.275rem 0.625rem",
  borderRadius: "999px",
  background: "hsl(var(--primary) / 0.14)",
  border: "1px solid hsl(var(--primary) / 0.3)",
  color: "hsl(var(--primary))",
  fontSize: "0.75rem",
  fontWeight: 700,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const titleStyle: CSSProperties = {
  fontSize: "clamp(1.5rem, 3.3vw, 2rem)",
  lineHeight: 1.1,
  letterSpacing: "-0.02em",
};

const subtitleStyle: CSSProperties = {
  color: "hsl(var(--foreground) / 0.8)",
  lineHeight: 1.45,
  maxWidth: "62ch",
};

const skeletonGroupStyle: CSSProperties = {
  display: "grid",
  gap: "0.625rem",
};

const ctaStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  borderRadius: "0.75rem",
  border: "1px solid hsl(var(--primary) / 0.45)",
  background: "linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.84) 100%)",
  color: "hsl(var(--primary-foreground))",
  fontWeight: 700,
  padding: "0.875rem 1rem",
  lineHeight: 1.2,
  boxShadow: "0 10px 24px hsl(var(--primary) / 0.35)",
};

const helperTextStyle: CSSProperties = {
  color: "hsl(var(--muted-foreground))",
  fontSize: "0.9rem",
  lineHeight: 1.4,
};

const errorAlertStyle: CSSProperties = {
  borderRadius: "0.75rem",
  border: "1px solid hsl(var(--destructive) / 0.45)",
  background: "hsl(var(--destructive) / 0.16)",
  color: "hsl(var(--destructive))",
  padding: "0.75rem 0.875rem",
  display: "grid",
  gap: "0.25rem",
  lineHeight: 1.35,
};

const modeToggleRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
};

const modeToggleButtonStyle: CSSProperties = {
  borderRadius: "0.625rem",
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--secondary))",
  color: "hsl(var(--secondary-foreground))",
  padding: "0.4rem 0.7rem",
  fontSize: "0.82rem",
  fontWeight: 600,
  cursor: "pointer",
};

function AuthShell({
  children,
  themeLabel,
  onToggleTheme,
}: {
  children: ReactNode;
  themeLabel: string;
  onToggleTheme: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-screen w-full items-center justify-center p-4 sm:p-8" style={shellStyle}>
      <section
        className="w-full max-w-2xl rounded-2xl border bg-white/95 p-5 shadow-xl sm:p-8"
        style={cardStyle}
        aria-live="polite"
      >
        <div style={modeToggleRowStyle}>
          <button type="button" onClick={onToggleTheme} style={modeToggleButtonStyle}>
            {themeLabel}
          </button>
        </div>
        {children}
      </section>
    </main>
  );
}

function SkeletonLine({ width, height = "0.75rem" }: { width: string; height?: string }) {
  return (
    <span
      aria-hidden="true"
      className="block rounded-full bg-slate-200"
      style={{
        width,
        height,
        borderRadius: "999px",
        background: "linear-gradient(90deg, hsl(var(--muted) / 0.55), hsl(var(--muted) / 0.95))",
      }}
    />
  );
}

function parseAuthUser(raw: unknown): AuthUser | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;

  const login =
    typeof candidate.login === "string"
      ? candidate.login
      : typeof candidate.username === "string"
        ? candidate.username
        : null;
  const name = typeof candidate.name === "string" ? candidate.name : null;
  const avatarUrl =
    typeof candidate.avatarUrl === "string"
      ? candidate.avatarUrl
      : typeof candidate.image === "string"
        ? candidate.image
        : null;

  if (!login && !name && !avatarUrl) {
    return null;
  }

  return { login, name, avatarUrl };
}

function normalizeSessionPayload(payload: unknown): AuthSessionResponse {
  if (!payload || typeof payload !== "object") {
    return { authenticated: false, user: null };
  }

  const candidate = payload as Record<string, unknown>;
  const parsedUser = parseAuthUser(candidate.user);

  if (typeof candidate.authenticated === "boolean") {
    return {
      authenticated: candidate.authenticated,
      user: candidate.authenticated ? parsedUser : null,
    };
  }

  return {
    authenticated: parsedUser !== null,
    user: parsedUser,
  };
}

export default function Home() {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<AuthSessionResponse>({ authenticated: false, user: null });
  const [authError, setAuthError] = useState<string | null>(null);
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const controller = new AbortController();

    async function loadSession() {
      setAuthError(null);

      try {
        const response = await fetch(SESSION_ENDPOINT, {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        if (response.status === 401 || response.status === 403 || response.status === 204) {
          setSession({ authenticated: false, user: null });
          setStatus("unauthenticated");
          return;
        }

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        const payload = (await response.json()) as unknown;
        const normalized = normalizeSessionPayload(payload);
        setSession(normalized);
        setStatus(normalized.authenticated ? "authenticated" : "unauthenticated");
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setAuthError(error instanceof Error ? error.message : "Unable to verify auth state.");
        setSession({ authenticated: false, user: null });
        setStatus("unauthenticated");
      }
    }

    void loadSession();

    return () => {
      controller.abort();
    };
  }, []);

  const viewerLabel = useMemo(
    () => session.user?.login ?? session.user?.name ?? null,
    [session.user?.login, session.user?.name],
  );

  if (status === "loading") {
    return (
      <AuthShell
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        onToggleTheme={toggleTheme}
      >
        <header style={headingStyle}>
          <span style={eyebrowStyle}>Authentication</span>
          <h1 style={titleStyle}>PR Attention Manager</h1>
          <p style={subtitleStyle}>
            Checking your GitHub sign-in status before loading repository attention queues.
          </p>
        </header>

        <section style={skeletonGroupStyle} aria-label="Loading session details">
          <SkeletonLine width="68%" />
          <SkeletonLine width="84%" />
          <SkeletonLine width="56%" />
        </section>

        <section style={skeletonGroupStyle} aria-label="Loading actions">
          <SkeletonLine width="100%" height="2.75rem" />
          <SkeletonLine width="44%" />
        </section>
      </AuthShell>
    );
  }

  if (status === "unauthenticated") {
    return (
      <AuthShell
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        onToggleTheme={toggleTheme}
      >
        <header style={headingStyle}>
          <span style={eyebrowStyle}>Authentication Required</span>
          <h1 style={titleStyle}>PR Attention Manager</h1>
          <p style={subtitleStyle}>
            Sign in with GitHub to load your tracked repositories and prioritize pull requests.
          </p>
        </header>

        {authError && (
          <section role="alert" style={errorAlertStyle}>
            <strong>Session check failed</strong>
            <span>{authError}</span>
          </section>
        )}

        <a
          href={SIGN_IN_ENDPOINT}
          className="inline-flex w-full items-center justify-center rounded-xl border px-4 py-3 text-center font-semibold shadow-sm"
          style={ctaStyle}
        >
          Continue with GitHub
        </a>

        <p style={helperTextStyle}>You will be redirected to GitHub and returned here after sign-in.</p>
      </AuthShell>
    );
  }

  return (
      <PrAttentionManager
        viewerLabel={viewerLabel}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSignedOut={() => {
          setSession({ authenticated: false, user: null });
          setStatus("unauthenticated");
      }}
    />
  );
}
