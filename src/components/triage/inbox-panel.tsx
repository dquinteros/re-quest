"use client";

import type { InboxResponse } from "@/types/pr";
import { TRIAGE_CONTROL_IDS, type Filters, type InboxPresetKey } from "./contracts";
import { InboxPresets } from "./inbox-presets";
import { InboxFilters } from "./inbox-filters";
import { InboxList } from "./inbox-list";
import { Badge } from "@/components/ui/badge";

interface InboxPanelProps {
  inbox: InboxResponse | null;
  inboxLoading: boolean;
  selectedId: string | null;
  filters: Filters;
  activePreset: InboxPresetKey | null;
  repoOptions: string[];
  authorOptions: string[];
  onSelectPullRequest: (id: string) => void;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onClearFilters: () => void;
  onApplyPreset: (key: InboxPresetKey) => void;
}

export function InboxPanel({
  inbox,
  inboxLoading,
  selectedId,
  filters,
  activePreset,
  repoOptions,
  authorOptions,
  onSelectPullRequest,
  onPatchFilters,
  onClearFilters,
  onApplyPreset,
}: InboxPanelProps) {
  return (
    <aside
      id={TRIAGE_CONTROL_IDS.inboxPanel}
      data-control-id={TRIAGE_CONTROL_IDS.inboxPanel}
      className="h-full flex flex-col border-r border-border bg-background min-h-0"
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-border space-y-2.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Inbox</h2>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {inbox?.total ?? 0} items
          </span>
        </div>

        {/* Badge counters */}
        <div className="flex gap-1.5">
          <button
            type="button"
            className="flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center transition-colors hover:bg-muted/60"
            onClick={() => onApplyPreset("needs_review")}
            aria-label="Filter: needs review"
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {inbox?.badges.needsReview ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Review</p>
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center transition-colors hover:bg-muted/60"
            onClick={() => onApplyPreset("changes_requested")}
            aria-label="Filter: changes requested"
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {inbox?.badges.changesRequestedFollowUp ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Changes</p>
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center transition-colors hover:bg-muted/60"
            onClick={() => onApplyPreset("failing_ci")}
            aria-label="Filter: failing CI"
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {inbox?.badges.failingCi ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Failing</p>
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-center transition-colors hover:bg-muted/60"
            onClick={() => onApplyPreset("flow_violations")}
            aria-label="Filter: flow violations"
          >
            <p className="text-lg font-semibold tabular-nums leading-none">
              {inbox?.badges.flowViolations ?? 0}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">Flow</p>
          </button>
        </div>

        <InboxPresets activePreset={activePreset} onApplyPreset={onApplyPreset} />
        <InboxFilters filters={filters} repoOptions={repoOptions} authorOptions={authorOptions} onPatchFilters={onPatchFilters} onClearFilters={onClearFilters} />
      </div>

      {/* List */}
      <InboxList
        items={inbox?.items ?? []}
        loading={inboxLoading}
        selectedId={selectedId}
        onSelectPullRequest={onSelectPullRequest}
      />
    </aside>
  );
}
