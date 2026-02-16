"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SHORTCUT_DEFINITIONS,
  useKeyboardShortcuts,
} from "@/hooks/use-keyboard-shortcuts";
import type { Theme } from "@/hooks/use-theme";
import {
  useUiPreferences,
} from "@/hooks/use-ui-preferences";
import type {
  AddTrackedRepoRequest,
  AvailableReposResponse,
  ApiError,
  InboxResponse,
  PullRequestDetail,
  PullRequestListItem,
  RemoveTrackedRepoRequest,
  TrackedReposResponse,
  TrackedRepository,
} from "@/types/pr";
import styles from "./pr-attention-manager.module.css";
import {
  DEFAULT_FILTERS,
  INBOX_PRESETS,
  TRIAGE_CONTROL_IDS,
  DetailWorkspace,
  HeaderBar,
  InboxPanel,
  TrackedRepoManager,
  inboxItemControlId,
  type Filters,
  type InboxPresetKey,
  type MutateTarget,
  type PendingReviewMode,
  type ReviewEvent,
} from "./triage";

const TRACKED_REPOS_ENDPOINT = "/api/tracked-repos";
const AVAILABLE_REPOS_ENDPOINT = "/api/github/repositories";

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getInboxQuery(filters: Filters): string {
  const params = new URLSearchParams();

  if (filters.q.trim()) {
    params.set("q", filters.q.trim());
  }

  const repos = csvToList(filters.repo);
  if (repos.length) {
    params.set("repo", repos.join(","));
  }

  const authors = csvToList(filters.author);
  if (authors.length) {
    params.set("author", authors.join(","));
  }

  if (filters.reviewState) {
    params.set("reviewState", filters.reviewState);
  }

  if (filters.ciState) {
    params.set("ciState", filters.ciState);
  }

  if (filters.draft !== "all") {
    params.set("draft", filters.draft);
  }

  params.set("sort", filters.sort);
  params.set("page", "1");
  params.set("pageSize", "50");

  return params.toString();
}

function formatSyncTime(syncedAt: string | null): string {
  if (!syncedAt) {
    return "No successful sync yet";
  }

  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) {
    return "Invalid sync timestamp";
  }

  return `${date.toLocaleString()} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
}

async function extractErrorMessage(response: Response): Promise<string> {
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

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
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

function urgencyClassName(score: number): string {
  if (score >= 60) {
    return styles.urgencyCritical;
  }

  if (score >= 40) {
    return styles.urgencyHigh;
  }

  if (score >= 20) {
    return styles.urgencyMedium;
  }

  return styles.urgencyLow;
}

function normalizeTrackedRepo(raw: unknown): TrackedRepository | null {
  if (typeof raw === "string") {
    const fullName = raw.trim();
    const [owner = "", name = ""] = fullName.split("/", 2);

    if (!owner || !name) {
      return null;
    }

    return { fullName, owner, name };
  }

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const candidate = raw as Record<string, unknown>;
  const fullNameRaw =
    typeof candidate.fullName === "string"
      ? candidate.fullName
      : typeof candidate.repository === "string"
        ? candidate.repository
        : null;

  if (!fullNameRaw) {
    return null;
  }

  const fullName = fullNameRaw.trim();
  const [parsedOwner = "", parsedName = ""] = fullName.split("/", 2);
  if (!parsedOwner || !parsedName) {
    return null;
  }

  const owner = typeof candidate.owner === "string" ? candidate.owner : parsedOwner;
  const name =
    typeof candidate.name === "string"
      ? candidate.name
      : typeof candidate.repo === "string"
        ? candidate.repo
        : parsedName;

  return {
    fullName,
    owner: owner.trim() || parsedOwner,
    name: name.trim() || parsedName,
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
    if (!repo) {
      continue;
    }

    deduped.set(repo.fullName.toLowerCase(), repo);
  }

  return Array.from(deduped.values()).sort((left, right) =>
    left.fullName.localeCompare(right.fullName),
  );
}

function focusControl(
  controlId: string,
  options?: {
    selectText?: boolean;
  },
): void {
  if (typeof document === "undefined") {
    return;
  }

  const control = document.getElementById(controlId);
  if (!(control instanceof HTMLElement)) {
    return;
  }

  control.focus();

  if (!options?.selectText) {
    return;
  }

  if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
    control.select();
  }
}

interface PrAttentionManagerProps {
  viewerLabel?: string | null;
  onSignedOut?: () => void;
  theme?: Theme;
  onToggleTheme?: () => void;
}

export function PrAttentionManager({
  viewerLabel = null,
  onSignedOut,
  theme = "light",
  onToggleTheme,
}: PrAttentionManagerProps) {
  const {
    preferences,
    setPreferences,
    setAdvancedPanel,
    setLastSelectedPrId,
  } = useUiPreferences();

  const filters = useMemo<Filters>(
    () => ({
      ...DEFAULT_FILTERS,
      ...preferences.filters,
      sort: preferences.sort,
    }),
    [preferences.filters, preferences.sort],
  );

  const [activePreset, setActivePreset] = useState<InboxPresetKey | null>(null);
  const [debouncedFilters, setDebouncedFilters] = useState<Filters>(filters);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(preferences.lastSelectedPrId);
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [trackedRepos, setTrackedRepos] = useState<TrackedRepository[]>([]);
  const [availableRepos, setAvailableRepos] = useState<TrackedRepository[]>([]);

  const [inboxLoading, setInboxLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [trackedReposLoading, setTrackedReposLoading] = useState(false);
  const [availableReposLoading, setAvailableReposLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [repoWriting, setRepoWriting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [writing, setWriting] = useState(false);

  const [inboxError, setInboxError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [trackedReposError, setTrackedReposError] = useState<string | null>(null);
  const [availableReposError, setAvailableReposError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);

  const [refreshToken, setRefreshToken] = useState(0);
  const [trackedReposRefreshToken, setTrackedReposRefreshToken] = useState(0);

  const [commentBody, setCommentBody] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [reviewEvent, setReviewEvent] = useState<ReviewEvent>("COMMENT");
  const [pendingReviewMode, setPendingReviewMode] = useState<PendingReviewMode>("pending_create");
  const [pendingReviewId, setPendingReviewId] = useState("");
  const [labelName, setLabelName] = useState("");
  const [assigneeLogin, setAssigneeLogin] = useState("");
  const [reviewerLogin, setReviewerLogin] = useState("");
  const [propTitle, setPropTitle] = useState("");
  const [propBody, setPropBody] = useState("");
  const [propState, setPropState] = useState<"open" | "closed">("open");
  const [milestoneNumber, setMilestoneNumber] = useState("");
  const [projectIdsCsv, setProjectIdsCsv] = useState("");
  const [selectedRepoToAdd, setSelectedRepoToAdd] = useState("");

  const advancedActionsOpen = Boolean(preferences.advancedPanels.advancedActions);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 220);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [filters]);

  useEffect(() => {
    setLastSelectedPrId(selectedId);
  }, [selectedId, setLastSelectedPrId]);

  const inboxQuery = useMemo(() => getInboxQuery(debouncedFilters), [debouncedFilters]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInbox() {
      setInboxLoading(true);
      setInboxError(null);

      try {
        const response = await requestJson<InboxResponse>(`/api/inbox/prs?${inboxQuery}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setInbox(response);
        setSelectedId((current) => {
          if (current && response.items.some((item) => item.id === current)) {
            return current;
          }

          return response.items[0]?.id ?? null;
        });
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setInboxError(error instanceof Error ? error.message : "Inbox request failed");
      } finally {
        if (!controller.signal.aborted) {
          setInboxLoading(false);
        }
      }
    }

    void loadInbox();

    return () => {
      controller.abort();
    };
  }, [inboxQuery, refreshToken]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    const controller = new AbortController();

    async function loadDetail(id: string) {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await requestJson<{ pullRequest?: PullRequestDetail } | PullRequestDetail>(
          `/api/prs/${encodeURIComponent(id)}`,
          {
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        const detailRecord: PullRequestDetail | null =
          response && typeof response === "object" && "pullRequest" in response
            ? response.pullRequest ?? null
            : (response as PullRequestDetail);

        setDetail(detailRecord);
        if (detailRecord) {
          setPropTitle(detailRecord.title);
          setPropBody(detailRecord.body ?? "");
          setPropState(detailRecord.state === "CLOSED" ? "closed" : "open");
          setMilestoneNumber("");
          setProjectIdsCsv(detailRecord.projects.join(","));
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setDetailError(error instanceof Error ? error.message : "Detail request failed");
      } finally {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      }
    }

    void loadDetail(selectedId);

    return () => {
      controller.abort();
    };
  }, [selectedId, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadTrackedRepos() {
      setTrackedReposLoading(true);
      setTrackedReposError(null);

      try {
        const response = await requestJson<TrackedReposResponse | unknown>(TRACKED_REPOS_ENDPOINT, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setTrackedRepos(extractTrackedRepos(response));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setTrackedReposError(error instanceof Error ? error.message : "Unable to load tracked repos");
      } finally {
        if (!controller.signal.aborted) {
          setTrackedReposLoading(false);
        }
      }
    }

    void loadTrackedRepos();

    return () => {
      controller.abort();
    };
  }, [trackedReposRefreshToken]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAvailableRepos() {
      setAvailableReposLoading(true);
      setAvailableReposError(null);

      try {
        const response = await requestJson<AvailableReposResponse | unknown>(AVAILABLE_REPOS_ENDPOINT, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) {
          return;
        }

        setAvailableRepos(extractTrackedRepos(response));
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }

        setAvailableReposError(
          error instanceof Error ? error.message : "Unable to load available repositories",
        );
      } finally {
        if (!controller.signal.aborted) {
          setAvailableReposLoading(false);
        }
      }
    }

    void loadAvailableRepos();

    return () => {
      controller.abort();
    };
  }, []);

  const addableRepos = useMemo(() => {
    if (!availableRepos.length) {
      return [];
    }

    const trackedLookup = new Set(trackedRepos.map((repo) => repo.fullName.toLowerCase()));
    return availableRepos.filter((repo) => !trackedLookup.has(repo.fullName.toLowerCase()));
  }, [availableRepos, trackedRepos]);

  useEffect(() => {
    setSelectedRepoToAdd((current) => {
      if (addableRepos.length === 0) {
        return "";
      }

      if (current && addableRepos.some((repo) => repo.fullName === current)) {
        return current;
      }

      return addableRepos[0].fullName;
    });
  }, [addableRepos]);

  const selectedListItem: PullRequestListItem | null = useMemo(() => {
    if (!selectedId || !inbox) {
      return null;
    }

    return inbox.items.find((item) => item.id === selectedId) ?? null;
  }, [inbox, selectedId]);

  const selectedUrl = detail?.url ?? selectedListItem?.url ?? null;

  const commitFilters = useCallback(
    (nextFilters: Filters) => {
      setPreferences((current) => ({
        ...current,
        filters: {
          q: nextFilters.q,
          repo: nextFilters.repo,
          author: nextFilters.author,
          reviewState: nextFilters.reviewState,
          ciState: nextFilters.ciState,
          draft: nextFilters.draft,
        },
        sort: nextFilters.sort,
      }));
    },
    [setPreferences],
  );

  const handlePatchFilters = useCallback(
    (patch: Partial<Filters>) => {
      setActivePreset(null);
      commitFilters({
        ...filters,
        ...patch,
      });
    },
    [commitFilters, filters],
  );

  const handleApplyPreset = useCallback(
    (key: InboxPresetKey) => {
      const preset = INBOX_PRESETS.find((candidate) => candidate.key === key);
      if (!preset) {
        return;
      }

      setActivePreset(key);
      commitFilters({
        ...DEFAULT_FILTERS,
        ...preset.filters,
      });
    },
    [commitFilters],
  );

  const handleClearFilters = useCallback(() => {
    setActivePreset(null);
    commitFilters(DEFAULT_FILTERS);
  }, [commitFilters]);

  async function runMutation(label: string, action: () => Promise<void>) {
    setWriting(true);
    setActionMessage(null);

    try {
      await action();
      setActionMessage(`${label} completed.`);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : `${label} failed`);
    } finally {
      setWriting(false);
    }
  }

  async function mutateStringItem(
    target: MutateTarget,
    value: string,
    method: "POST" | "DELETE",
  ) {
    if (!selectedId || !value.trim()) {
      return;
    }

    const encodedId = encodeURIComponent(selectedId);
    const trimmed = value.trim();
    const payload =
      target === "labels"
        ? { labels: [trimmed] }
        : target === "assignees"
          ? { assignees: [trimmed] }
          : { reviewers: [trimmed] };

    await runMutation(`${method === "POST" ? "Added" : "Removed"} ${target.slice(0, -1)}`, async () => {
      await requestJson(`/api/prs/${encodedId}/${target}`, {
        method,
        body: JSON.stringify(payload),
      });
    });
  }

  async function handleManualRefresh() {
    setSyncing(true);
    setActionMessage(null);

    try {
      await requestJson("/api/sync/refresh", {
        method: "POST",
      });

      setActionMessage("Sync started.");
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unable to start sync");
    } finally {
      setSyncing(false);
    }
  }

  async function addTrackedRepo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fullName = selectedRepoToAdd.trim();
    if (!fullName) {
      return;
    }

    if (!/^[^/\s]+\/[^/\s]+$/.test(fullName)) {
      setTrackedReposError("Repository must use the format owner/repo.");
      return;
    }

    setRepoWriting(true);
    setTrackedReposError(null);
    setActionMessage(null);

    try {
      const payload: AddTrackedRepoRequest = { fullName };
      const response = await requestJson<TrackedReposResponse | unknown>(TRACKED_REPOS_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const next = extractTrackedRepos(response);
      if (next.length > 0) {
        setTrackedRepos(next);
      } else {
        setTrackedReposRefreshToken((value) => value + 1);
      }

      setActionMessage(`Tracking ${fullName}.`);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setTrackedReposError(error instanceof Error ? error.message : "Unable to add repository");
    } finally {
      setRepoWriting(false);
    }
  }

  async function removeTrackedRepo(fullName: string) {
    setRepoWriting(true);
    setTrackedReposError(null);
    setActionMessage(null);

    try {
      const payload: RemoveTrackedRepoRequest = { fullName };
      const response = await requestJson<TrackedReposResponse | unknown>(TRACKED_REPOS_ENDPOINT, {
        method: "DELETE",
        body: JSON.stringify(payload),
      });

      const next = extractTrackedRepos(response);
      if (next.length > 0) {
        setTrackedRepos(next);
      } else {
        setTrackedRepos((current) =>
          current.filter((repo) => repo.fullName.toLowerCase() !== fullName.toLowerCase()),
        );
      }

      setActionMessage(`Removed ${fullName}.`);
      setRefreshToken((value) => value + 1);
    } catch (error) {
      setTrackedReposError(error instanceof Error ? error.message : "Unable to remove repository");
    } finally {
      setRepoWriting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    setActionMessage(null);

    try {
      await signOut({
        redirect: false,
        callbackUrl: "/",
      });

      if (onSignedOut) {
        onSignedOut();
      } else {
        window.location.reload();
      }
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "Unable to sign out");
    } finally {
      setSigningOut(false);
    }
  }

  async function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId || !commentBody.trim()) {
      return;
    }

    const body = commentBody.trim();

    await runMutation("Comment", async () => {
      await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
    });

    setCommentBody("");
  }

  async function submitQuickReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    const trimmedReviewBody = reviewBody.trim();

    await runMutation("Review", async () => {
      await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/reviews`, {
        method: "POST",
        body: JSON.stringify({
          mode: "quick",
          event: reviewEvent,
          body: trimmedReviewBody || undefined,
        }),
      });
    });
  }

  async function submitPendingReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId) {
      return;
    }

    const trimmedReviewBody = reviewBody.trim();

    if (
      (pendingReviewMode === "pending_submit" || pendingReviewMode === "pending_delete") &&
      (!pendingReviewId.trim() || Number.isNaN(Number(pendingReviewId)))
    ) {
      setActionMessage("Pending review actions require a numeric review ID.");
      return;
    }

    const payload =
      pendingReviewMode === "pending_create"
        ? {
            mode: "pending",
            action: "create",
            body: trimmedReviewBody || undefined,
          }
        : pendingReviewMode === "pending_submit"
          ? {
              mode: "pending",
              action: "submit",
              reviewId: Number(pendingReviewId),
              event: reviewEvent,
              body: trimmedReviewBody || undefined,
            }
          : {
              mode: "pending",
              action: "delete",
              reviewId: Number(pendingReviewId),
            };

    await runMutation("Review", async () => {
      await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/reviews`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    });
  }

  async function submitProperties(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedId || !detail) {
      return;
    }

    const milestoneRaw = milestoneNumber.trim();
    const projectIds = csvToList(projectIdsCsv);

    const payload: Record<string, unknown> = {
      title: propTitle.trim() || detail.title,
      body: propBody,
      state: propState,
    };

    if (milestoneRaw) {
      const parsedMilestone = Number(milestoneRaw);
      if (Number.isNaN(parsedMilestone)) {
        setActionMessage("Milestone must be a number.");
        return;
      }

      payload.milestoneNumber = parsedMilestone;
    }

    if (projectIds.length) {
      payload.projectIds = projectIds;
    }

    await runMutation("Properties update", async () => {
      await requestJson(`/api/prs/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    });
  }

  const moveSelection = useCallback(
    (delta: number) => {
      const items = inbox?.items ?? [];
      if (!items.length) {
        return;
      }

      setSelectedId((current) => {
        const currentIndex = current ? items.findIndex((item) => item.id === current) : -1;
        let nextIndex = currentIndex;

        if (nextIndex === -1) {
          nextIndex = delta > 0 ? 0 : items.length - 1;
        } else {
          nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex + delta));
        }

        const nextId = items[nextIndex]?.id ?? null;
        if (nextId) {
          window.requestAnimationFrame(() => {
            const controlId = inboxItemControlId(nextId);
            focusControl(controlId);
            const itemElement = document.getElementById(controlId);
            if (itemElement instanceof HTMLElement) {
              itemElement.scrollIntoView({ block: "nearest" });
            }
          });
        }

        return nextId;
      });
    },
    [inbox?.items],
  );

  const focusAdvancedControl = useCallback(
    (controlId: string) => {
      if (!advancedActionsOpen) {
        setAdvancedPanel("advancedActions", true);
        window.setTimeout(() => {
          focusControl(controlId, { selectText: true });
        }, 0);
        return;
      }

      focusControl(controlId, { selectText: true });
    },
    [advancedActionsOpen, setAdvancedPanel],
  );

  const dismissUi = useCallback(() => {
    setShortcutsHelpOpen(false);
    setActionMessage(null);

    if (advancedActionsOpen) {
      setAdvancedPanel("advancedActions", false);
    }

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  }, [advancedActionsOpen, setAdvancedPanel]);

  useKeyboardShortcuts({
    callbacks: {
      focusSearch: () => {
        focusControl(TRIAGE_CONTROL_IDS.filterSearch, { selectText: true });
      },
      selectNext: () => {
        moveSelection(1);
      },
      selectPrevious: () => {
        moveSelection(-1);
      },
      openSelected: () => {
        focusControl(TRIAGE_CONTROL_IDS.detailPanel);
      },
      openInBrowser: () => {
        if (!selectedUrl) {
          return;
        }

        window.open(selectedUrl, "_blank", "noopener,noreferrer");
      },
      openComment: () => {
        focusControl(TRIAGE_CONTROL_IDS.commentBody, { selectText: true });
      },
      openReview: () => {
        focusControl(TRIAGE_CONTROL_IDS.reviewBody, { selectText: true });
      },
      openLabels: () => {
        focusAdvancedControl(TRIAGE_CONTROL_IDS.labelInput);
      },
      openAssignees: () => {
        focusAdvancedControl(TRIAGE_CONTROL_IDS.assigneeInput);
      },
      openReviewers: () => {
        focusAdvancedControl(TRIAGE_CONTROL_IDS.reviewerInput);
      },
      openProperties: () => {
        focusAdvancedControl(TRIAGE_CONTROL_IDS.propertiesTitle);
      },
      dismiss: () => {
        dismissUi();
      },
      showShortcutsHelp: () => {
        setShortcutsHelpOpen(true);
      },
    },
  });

  return (
    <main className={styles.shell}>
      <HeaderBar
        viewerLabel={viewerLabel}
        syncTimeLabel={formatSyncTime(inbox?.syncedAt ?? null)}
        syncing={syncing}
        signingOut={signingOut}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        onRefresh={() => {
          void handleManualRefresh();
        }}
        onSignOut={() => {
          void handleSignOut();
        }}
        onShowShortcuts={() => {
          setShortcutsHelpOpen(true);
        }}
        onToggleTheme={() => {
          onToggleTheme?.();
        }}
      />

      <TrackedRepoManager
        trackedRepos={trackedRepos}
        trackedReposLoading={trackedReposLoading}
        trackedReposError={trackedReposError}
        addableRepos={addableRepos}
        availableReposLoading={availableReposLoading}
        availableReposError={availableReposError}
        selectedRepoToAdd={selectedRepoToAdd}
        repoWriting={repoWriting}
        onSelectedRepoToAddChange={setSelectedRepoToAdd}
        onAddTrackedRepo={(event) => {
          void addTrackedRepo(event);
        }}
        onRemoveTrackedRepo={(fullName) => {
          void removeTrackedRepo(fullName);
        }}
      />

      {(inboxError || detailError || actionMessage) && (
        <section className={styles.messageRow} aria-live="polite">
          {inboxError && <p className={styles.errorText}>Inbox: {inboxError}</p>}
          {detailError && <p className={styles.errorText}>Detail: {detailError}</p>}
          {actionMessage && <p className={styles.infoText}>{actionMessage}</p>}
        </section>
      )}

      <section className={styles.workspace}>
        <InboxPanel
          inbox={inbox}
          inboxLoading={inboxLoading}
          selectedId={selectedId}
          filters={filters}
          activePreset={activePreset}
          onSelectPullRequest={setSelectedId}
          onPatchFilters={handlePatchFilters}
          onClearFilters={handleClearFilters}
          onApplyPreset={handleApplyPreset}
          getUrgencyClassName={urgencyClassName}
        />

        <DetailWorkspace
          selectedId={selectedId}
          selectedListItem={selectedListItem}
          detail={detail}
          detailLoading={detailLoading}
          detailError={detailError}
          writing={writing}
          commentBody={commentBody}
          reviewBody={reviewBody}
          reviewEvent={reviewEvent}
          pendingReviewMode={pendingReviewMode}
          pendingReviewId={pendingReviewId}
          labelName={labelName}
          assigneeLogin={assigneeLogin}
          reviewerLogin={reviewerLogin}
          propTitle={propTitle}
          propBody={propBody}
          propState={propState}
          milestoneNumber={milestoneNumber}
          projectIdsCsv={projectIdsCsv}
          onCommentBodyChange={setCommentBody}
          onReviewBodyChange={setReviewBody}
          onReviewEventChange={setReviewEvent}
          onPendingReviewModeChange={setPendingReviewMode}
          onPendingReviewIdChange={setPendingReviewId}
          onLabelNameChange={setLabelName}
          onAssigneeLoginChange={setAssigneeLogin}
          onReviewerLoginChange={setReviewerLogin}
          onPropTitleChange={setPropTitle}
          onPropBodyChange={setPropBody}
          onPropStateChange={setPropState}
          onMilestoneNumberChange={setMilestoneNumber}
          onProjectIdsCsvChange={setProjectIdsCsv}
          onSubmitComment={(event) => {
            void submitComment(event);
          }}
          onSubmitQuickReview={(event) => {
            void submitQuickReview(event);
          }}
          onSubmitPendingReview={(event) => {
            void submitPendingReview(event);
          }}
          onSubmitProperties={(event) => {
            void submitProperties(event);
          }}
          onMutateStringItem={(target, value, method) => {
            void mutateStringItem(target, value, method);
          }}
          advancedActionsOpen={advancedActionsOpen}
          onAdvancedActionsOpenChange={(open) => {
            setAdvancedPanel("advancedActions", open);
          }}
        />
      </section>

      <Dialog open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen}>
        <DialogContent
          id={TRIAGE_CONTROL_IDS.shortcutsHelpDialog}
          aria-label="Keyboard shortcuts"
          className="max-w-xl"
        >
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>
              Use these shortcuts to triage pull requests faster.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-2">
            {Object.values(SHORTCUT_DEFINITIONS).map((definition) => (
              <div
                key={definition.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span className="text-sm text-foreground">{definition.description}</span>
                <span className="flex gap-1">
                  {definition.keys.map((key) => (
                    <kbd
                      key={key}
                      className="rounded border border-border bg-background px-2 py-0.5 text-xs font-medium"
                    >
                      {key}
                    </kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}
