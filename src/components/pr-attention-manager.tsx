"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { signOut } from "next-auth/react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { useUiPreferences } from "@/hooks/use-ui-preferences";
import { useFilters } from "@/hooks/use-filters";
import { useInbox } from "@/hooks/use-inbox";
import { usePrDetail } from "@/hooks/use-pr-detail";
import { usePrMutations } from "@/hooks/use-pr-mutations";
import { requestJson } from "@/lib/request";
import type { PullRequestListItem } from "@/types/pr";
import { AppNav } from "./app-nav";
import {
  TRIAGE_CONTROL_IDS,
  HeaderBar,
  InboxPanel,
  DetailPanel,
  ToastContainer,
  useToast,
  inboxItemControlId,
} from "./triage";
import { CommandPalette } from "./triage/command-palette";

function formatSyncTime(syncedAt: string | null): string {
  if (!syncedAt) return "No successful sync yet";
  const date = new Date(syncedAt);
  if (Number.isNaN(date.getTime())) return "Invalid sync timestamp";
  return `${date.toLocaleString()} (${formatDistanceToNowStrict(date, { addSuffix: true })})`;
}

function focusControl(controlId: string, options?: { selectText?: boolean }): void {
  if (typeof document === "undefined") return;
  const control = document.getElementById(controlId);
  if (!(control instanceof HTMLElement)) return;
  control.focus();
  if (!options?.selectText) return;
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
  const { preferences, setLastSelectedPrId } = useUiPreferences();
  const { toasts, addToast, dismissToast } = useToast();

  const { filters, activePreset, patchFilters, applyPreset, clearFilters } = useFilters();

  const {
    inbox,
    inboxLoading,
    inboxError,
    selectedId,
    setSelectedId,
    triggerRefresh,
    refreshToken,
  } = useInbox(filters, preferences.lastSelectedPrId);

  const { detail, detailLoading, detailError } = usePrDetail(selectedId, refreshToken);

  const mutations = usePrMutations(selectedId, detail, triggerRefresh, addToast);

  useEffect(() => {
    if (detail) mutations.resetFormForDetail(detail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail]);

  useEffect(() => {
    setLastSelectedPrId(selectedId);
  }, [selectedId, setLastSelectedPrId]);

  const [syncing, setSyncing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [aiReviewRunning, setAiReviewRunning] = useState(false);

  const selectedListItem: PullRequestListItem | null = useMemo(() => {
    if (!selectedId || !inbox) return null;
    return inbox.items.find((item) => item.id === selectedId) ?? null;
  }, [inbox, selectedId]);

  const selectedUrl = detail?.url ?? selectedListItem?.url ?? null;

  async function handleManualRefresh() {
    setSyncing(true);
    try {
      await requestJson("/api/sync/refresh", { method: "POST" });
      addToast("Sync started.", "info");
      triggerRefresh();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Unable to start sync", "error");
    } finally {
      setSyncing(false);
    }
  }

  async function handleRunAiReview() {
    if (!selectedId) return;
    setAiReviewRunning(true);
    try {
      await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/ai-review`, {
        method: "POST",
      });
      addToast("AI review started. Results will be posted to the PR on GitHub.", "info");
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Failed to start AI review", "error");
    } finally {
      setAiReviewRunning(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirect: false, callbackUrl: "/" });
      if (onSignedOut) onSignedOut();
      else window.location.reload();
    } catch (error) {
      addToast(error instanceof Error ? error.message : "Unable to sign out", "error");
    } finally {
      setSigningOut(false);
    }
  }

  const moveSelection = useCallback(
    (delta: number) => {
      const items = inbox?.items ?? [];
      if (!items.length) return;
      setSelectedId((current) => {
        const currentIndex = current ? items.findIndex((item) => item.id === current) : -1;
        let nextIndex = currentIndex;
        if (nextIndex === -1) nextIndex = delta > 0 ? 0 : items.length - 1;
        else nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex + delta));
        const nextId = items[nextIndex]?.id ?? null;
        if (nextId) {
          window.requestAnimationFrame(() => {
            const controlId = inboxItemControlId(nextId);
            focusControl(controlId);
            document.getElementById(controlId)?.scrollIntoView({ block: "nearest" });
          });
        }
        return nextId;
      });
    },
    [inbox?.items, setSelectedId],
  );

  const dismissUi = useCallback(() => {
    setShortcutsHelpOpen(false);
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  }, []);

  useKeyboardShortcuts({
    callbacks: {
      focusSearch: () => focusControl(TRIAGE_CONTROL_IDS.filterSearch, { selectText: true }),
      selectNext: () => moveSelection(1),
      selectPrevious: () => moveSelection(-1),
      openSelected: () => focusControl(TRIAGE_CONTROL_IDS.detailPanel),
      openInBrowser: () => {
        if (selectedUrl) window.open(selectedUrl, "_blank", "noopener,noreferrer");
      },
      openComment: () => focusControl(TRIAGE_CONTROL_IDS.commentBody, { selectText: true }),
      openReview: () => focusControl(TRIAGE_CONTROL_IDS.reviewBody, { selectText: true }),
      openLabels: () => focusControl(TRIAGE_CONTROL_IDS.labelInput, { selectText: true }),
      openAssignees: () => focusControl(TRIAGE_CONTROL_IDS.assigneeInput, { selectText: true }),
      openReviewers: () => focusControl(TRIAGE_CONTROL_IDS.reviewerInput, { selectText: true }),
      openProperties: () => focusControl(TRIAGE_CONTROL_IDS.propertiesTitle, { selectText: true }),
      dismiss: () => dismissUi(),
      showShortcutsHelp: () => setShortcutsHelpOpen(true),
    },
  });

  return (
    <>
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        signingOut={signingOut}
        authenticated
        onToggleTheme={() => onToggleTheme?.()}
        onSignOut={() => void handleSignOut()}
      />
      <main className="flex flex-col h-[calc(100vh-3rem)] bg-background">
        <HeaderBar
          syncTimeLabel={formatSyncTime(inbox?.syncedAt ?? null)}
          syncing={syncing}
          onRefresh={() => void handleManualRefresh()}
          onShowShortcuts={() => setShortcutsHelpOpen(true)}
        />

        {(inboxError || detailError) && (
          <div className="px-5 py-2 border-b border-border" aria-live="polite">
            {inboxError && (
              <p className="text-xs text-destructive">Inbox: {inboxError}</p>
            )}
            {detailError && (
              <p className="text-xs text-destructive">Detail: {detailError}</p>
            )}
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          <InboxPanel
            inbox={inbox}
            inboxLoading={inboxLoading}
            selectedId={selectedId}
            filters={filters}
            activePreset={activePreset}
            onSelectPullRequest={setSelectedId}
            onPatchFilters={patchFilters}
            onClearFilters={clearFilters}
            onApplyPreset={applyPreset}
          />

          <DetailPanel
            selectedId={selectedId}
            selectedListItem={selectedListItem}
            detail={detail}
            detailLoading={detailLoading}
            detailError={detailError}
            writing={mutations.writing}
            form={mutations.form}
            setFormField={mutations.setFormField}
            onSubmitComment={mutations.submitComment}
            onSubmitQuickReview={mutations.submitQuickReview}
            onSubmitPendingReview={mutations.submitPendingReview}
            onSubmitProperties={mutations.submitProperties}
            onMutateStringItem={mutations.mutateStringItem}
            aiReviewRunning={aiReviewRunning}
            onRunAiReview={() => void handleRunAiReview()}
          />
        </div>

        <ToastContainer toasts={toasts} onDismiss={dismissToast} />

        <CommandPalette
          items={inbox?.items ?? []}
          selectedId={selectedId}
          selectedUrl={selectedUrl}
          onSelectPullRequest={setSelectedId}
          onApplyPreset={applyPreset}
          onClearFilters={clearFilters}
          onRefresh={() => void handleManualRefresh()}
          onShowShortcuts={() => setShortcutsHelpOpen(true)}
          onFocusComment={() => focusControl(TRIAGE_CONTROL_IDS.commentBody, { selectText: true })}
          onFocusReview={() => focusControl(TRIAGE_CONTROL_IDS.reviewBody, { selectText: true })}
          onOpenInBrowser={() => {
            if (selectedUrl) window.open(selectedUrl, "_blank", "noopener,noreferrer");
          }}
        />

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
    </>
  );
}
