"use client";

import { signOut } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { requestJson } from "@/lib/request";
import { Button } from "@/components/ui/button";
import type {
  AvailableReposResponse,
  TrackedReposResponse,
  TrackedRepository,
  AddTrackedRepoRequest,
  RemoveTrackedRepoRequest,
} from "@/types/pr";
import { AppNav } from "./app-nav";
import { TrackedRepoManager } from "./triage";
import type { RepoEntry } from "./triage/tracked-repo-manager";

const TRACKED_REPOS_ENDPOINT = "/api/tracked-repos";
const AVAILABLE_REPOS_ENDPOINT = "/api/github/repositories";

function normalizeTrackedRepo(raw: unknown): TrackedRepository | null {
  if (typeof raw === "string") {
    const fullName = raw.trim();
    const [owner = "", name = ""] = fullName.split("/", 2);
    if (!owner || !name) return null;
    return { fullName, owner, name, defaultBranch: null };
  }

  if (!raw || typeof raw !== "object") return null;

  const candidate = raw as Record<string, unknown>;
  const fullNameRaw =
    typeof candidate.fullName === "string"
      ? candidate.fullName
      : typeof candidate.repository === "string"
        ? candidate.repository
        : null;

  if (!fullNameRaw) return null;

  const fullName = fullNameRaw.trim();
  const [parsedOwner = "", parsedName = ""] = fullName.split("/", 2);
  if (!parsedOwner || !parsedName) return null;

  const owner = typeof candidate.owner === "string" ? candidate.owner : parsedOwner;
  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.repo === "string"
        ? candidate.repo
        : parsedName;

  const defaultBranch =
    typeof candidate.defaultBranch === "string"
      ? candidate.defaultBranch
      : typeof candidate.default_branch === "string"
        ? candidate.default_branch
        : null;

  return {
    fullName,
    owner: owner.trim() || parsedOwner,
    name: name.trim() || parsedName,
    defaultBranch,
  };
}

function extractTrackedRepos(payload: unknown): TrackedRepository[] {
  const listSource: unknown[] = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object"
      ? Array.isArray((payload as { trackedRepos?: unknown[] }).trackedRepos)
        ? ((payload as { trackedRepos?: unknown[] }).trackedRepos ?? [])
        : Array.isArray((payload as { repositories?: unknown[] }).repositories)
          ? ((payload as { repositories?: unknown[] }).repositories ?? [])
          : Array.isArray((payload as { items?: unknown[] }).items)
            ? ((payload as { items?: unknown[] }).items ?? [])
            : []
      : [];

  const deduped = new Map<string, TrackedRepository>();
  for (const item of listSource) {
    const repo = normalizeTrackedRepo(item);
    if (!repo) continue;
    deduped.set(repo.fullName.toLowerCase(), repo);
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
}

interface TrackedRepositoriesPageProps {
  viewerLabel?: string | null;
}

export function TrackedRepositoriesPage({
  viewerLabel = null,
}: TrackedRepositoriesPageProps) {
  const { theme, toggleTheme } = useTheme();

  const [trackedRepos, setTrackedRepos] = useState<TrackedRepository[]>([]);
  const [availableRepos, setAvailableRepos] = useState<TrackedRepository[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [togglingRepos, setTogglingRepos] = useState<Set<string>>(new Set());
  const [signingOut, setSigningOut] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        const [trackedRes, availableRes] = await Promise.all([
          requestJson<TrackedReposResponse | unknown>(TRACKED_REPOS_ENDPOINT, {
            signal: controller.signal,
          }),
          requestJson<AvailableReposResponse | unknown>(AVAILABLE_REPOS_ENDPOINT, {
            signal: controller.signal,
          }),
        ]);

        if (controller.signal.aborted) return;

        setTrackedRepos(extractTrackedRepos(trackedRes));
        setAvailableRepos(extractTrackedRepos(availableRes));
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Unable to load repositories");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAll();
    return () => controller.abort();
  }, [refreshToken]);

  const unifiedRepos: RepoEntry[] = useMemo(() => {
    const trackedSet = new Set(trackedRepos.map((r) => r.fullName.toLowerCase()));
    const merged = new Map<string, RepoEntry>();

    for (const repo of availableRepos) {
      merged.set(repo.fullName.toLowerCase(), {
        ...repo,
        tracked: trackedSet.has(repo.fullName.toLowerCase()),
      });
    }

    for (const repo of trackedRepos) {
      const key = repo.fullName.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.tracked = true;
        if (repo.defaultBranch && !existing.defaultBranch) {
          existing.defaultBranch = repo.defaultBranch;
        }
      } else {
        merged.set(key, { ...repo, tracked: true });
      }
    }

    return Array.from(merged.values()).sort((a, b) =>
      a.fullName.localeCompare(b.fullName),
    );
  }, [trackedRepos, availableRepos]);

  async function toggleTrackedRepo(fullName: string, currentlyTracked: boolean) {
    setTogglingRepos((prev) => new Set(prev).add(fullName));
    setError(null);
    setActionMessage(null);

    try {
      if (currentlyTracked) {
        const payload: RemoveTrackedRepoRequest = { fullName };
        const response = await requestJson<TrackedReposResponse | unknown>(
          TRACKED_REPOS_ENDPOINT,
          { method: "DELETE", body: JSON.stringify(payload) },
        );
        const next = extractTrackedRepos(response);
        if (next.length > 0) setTrackedRepos(next);
        else setTrackedRepos((current) => current.filter((r) => r.fullName.toLowerCase() !== fullName.toLowerCase()));
        setActionMessage(`Removed ${fullName}.`);
      } else {
        const payload: AddTrackedRepoRequest = { fullName };
        const response = await requestJson<TrackedReposResponse | unknown>(
          TRACKED_REPOS_ENDPOINT,
          { method: "POST", body: JSON.stringify(payload) },
        );
        const next = extractTrackedRepos(response);
        if (next.length > 0) setTrackedRepos(next);
        else setRefreshToken((v) => v + 1);
        setActionMessage(`Tracking ${fullName}.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update repository");
    } finally {
      setTogglingRepos((prev) => {
        const next = new Set(prev);
        next.delete(fullName);
        return next;
      });
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setActionMessage(null);
    try {
      await signOut({ redirect: false, callbackUrl: "/" });
      window.location.assign("/");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Unable to sign out");
      setSigningOut(false);
    }
  }

  return (
    <>
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        signingOut={signingOut}
        authenticated
        onToggleTheme={toggleTheme}
        onSignOut={() => void handleSignOut()}
      />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Tracked repositories</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage the repositories that feed your PR attention inbox.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => setRefreshToken((v) => v + 1)}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <TrackedRepoManager
          repos={unifiedRepos}
          loading={loading}
          error={error}
          togglingRepos={togglingRepos}
          onToggleTracked={(fullName, currentlyTracked) => {
            void toggleTrackedRepo(fullName, currentlyTracked);
          }}
        />

        {actionMessage && (
          <div className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2" aria-live="polite">
            {actionMessage}
          </div>
        )}
      </main>
    </>
  );
}
