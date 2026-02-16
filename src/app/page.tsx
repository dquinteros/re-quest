"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AppNav } from "@/components/app-nav";
import { PrAttentionManager } from "@/components/pr-attention-manager";
import { useTheme } from "@/hooks/use-theme";
import type { AuthSessionResponse, AuthUser } from "@/types/pr";

const SESSION_ENDPOINT = "/api/auth/session";
const SIGN_IN_ENDPOINT = "/api/auth/signin/github";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

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
    <>
      <AppNav
        themeLabel={themeLabel}
        authenticated={false}
        onToggleTheme={onToggleTheme}
      />
      <main className="mx-auto flex min-h-[calc(100dvh-var(--nav-height,3.5rem))] w-full items-center justify-center p-[clamp(1rem,4vw,2.5rem)]">
        <section
          className="grid w-full max-w-[44rem] gap-4 rounded-2xl border border-border bg-[linear-gradient(180deg,hsl(var(--card))_0%,hsl(var(--muted)/0.55)_100%)] p-[clamp(1.25rem,3.5vw,2rem)] shadow-[0_20px_50px_hsl(var(--foreground)/0.16)]"
          aria-live="polite"
        >
          {children}
        </section>
      </main>
    </>
  );
}

function SkeletonLine({ width, height = "0.75rem" }: { width: string; height?: string }) {
  return (
    <span
      aria-hidden="true"
      className="block rounded-full"
      style={{
        width,
        height,
        background: "linear-gradient(90deg, hsl(var(--muted) / 0.55), hsl(var(--muted) / 0.95))",
        animation: "shimmer 1.5s infinite",
        backgroundSize: "200% 100%",
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
        <header className="grid gap-2">
          <span className="inline-flex w-fit rounded-full border border-primary/30 bg-primary/[0.14] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            Authentication
          </span>
          <h1 className="text-[clamp(1.5rem,3.3vw,2rem)] leading-tight tracking-tight">
            PR Attention Manager
          </h1>
          <p className="max-w-[62ch] leading-relaxed text-foreground/80">
            Checking your GitHub sign-in status before loading repository attention queues.
          </p>
        </header>

        <section className="grid gap-2.5" aria-label="Loading session details">
          <SkeletonLine width="68%" />
          <SkeletonLine width="84%" />
          <SkeletonLine width="56%" />
        </section>

        <section className="grid gap-2.5" aria-label="Loading actions">
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
        <header className="grid gap-2">
          <span className="inline-flex w-fit rounded-full border border-primary/30 bg-primary/[0.14] px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-primary">
            Authentication Required
          </span>
          <h1 className="text-[clamp(1.5rem,3.3vw,2rem)] leading-tight tracking-tight">
            PR Attention Manager
          </h1>
          <p className="max-w-[62ch] leading-relaxed text-foreground/80">
            Sign in with GitHub to load your tracked repositories and prioritize pull requests.
          </p>
        </header>

        {authError && (
          <section
            role="alert"
            className="grid gap-1 rounded-xl border border-destructive/45 bg-destructive/[0.16] px-3.5 py-3 leading-snug text-destructive"
          >
            <strong>Session check failed</strong>
            <span>{authError}</span>
          </section>
        )}

        <a
          href={SIGN_IN_ENDPOINT}
          aria-label="Sign in with GitHub"
          className="inline-flex w-full items-center justify-center rounded-xl border border-primary/45 bg-[linear-gradient(180deg,hsl(var(--primary))_0%,hsl(var(--primary)/0.84)_100%)] px-4 py-3.5 text-center font-bold leading-tight text-primary-foreground shadow-[0_10px_24px_hsl(var(--primary)/0.35)] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:translate-y-0"
        >
          Continue with GitHub
        </a>

        <p className="text-[0.9rem] leading-snug text-muted-foreground">
          You will be redirected to GitHub and returned here after sign-in.
        </p>
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
