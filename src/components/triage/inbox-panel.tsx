"use client";

import clsx from "clsx";
import type { InboxResponse } from "@/types/pr";
import styles from "../pr-attention-manager.module.css";
import {
  CI_STATE_OPTIONS,
  INBOX_PRESETS,
  REVIEW_STATE_OPTIONS,
  SORT_OPTIONS,
  TRIAGE_CONTROL_IDS,
  type Filters,
  type InboxPresetKey,
  inboxItemControlId,
  presetControlId,
} from "./contracts";

interface InboxPanelProps {
  inbox: InboxResponse | null;
  inboxLoading: boolean;
  selectedId: string | null;
  filters: Filters;
  activePreset: InboxPresetKey | null;
  onSelectPullRequest: (id: string) => void;
  onPatchFilters: (patch: Partial<Filters>) => void;
  onClearFilters: () => void;
  onApplyPreset: (key: InboxPresetKey) => void;
  getUrgencyClassName: (score: number) => string;
}

export function InboxPanel({
  inbox,
  inboxLoading,
  selectedId,
  filters,
  activePreset,
  onSelectPullRequest,
  onPatchFilters,
  onClearFilters,
  onApplyPreset,
  getUrgencyClassName,
}: InboxPanelProps) {
  return (
    <aside id={TRIAGE_CONTROL_IDS.inboxPanel} data-control-id={TRIAGE_CONTROL_IDS.inboxPanel} className={styles.listPanel}>
      <div>
        <header className={styles.panelHeader}>
          <h2>Inbox</h2>
          <span>{inbox?.total ?? 0} items</span>
        </header>

        <section className={styles.badgeGrid} aria-label="Inbox counters">
          <article className={styles.badgeCard}>
            <h2>Needs review</h2>
            <p>{inbox?.badges.needsReview ?? 0}</p>
          </article>
          <article className={styles.badgeCard}>
            <h2>Changes requested</h2>
            <p>{inbox?.badges.changesRequestedFollowUp ?? 0}</p>
          </article>
          <article className={styles.badgeCard}>
            <h2>Failing CI</h2>
            <p>{inbox?.badges.failingCi ?? 0}</p>
          </article>
        </section>

        <div className={styles.syncButtons} style={{ marginTop: "0.75rem", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          {INBOX_PRESETS.map((preset) => {
            const controlId = presetControlId(preset.key);
            const isPressed = activePreset === preset.key;

            return (
              <button
                key={preset.key}
                id={controlId}
                data-control-id={controlId}
                data-shortcut-target={controlId}
                type="button"
                className={clsx(styles.clearButton, isPressed && styles.listItemActive)}
                aria-pressed={isPressed}
                onClick={() => {
                  onApplyPreset(preset.key);
                }}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <section className={styles.filters}>
          <label>
            Search
            <input
              id={TRIAGE_CONTROL_IDS.filterSearch}
              data-control-id={TRIAGE_CONTROL_IDS.filterSearch}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterSearch}
              type="search"
              placeholder="Title/body"
              value={filters.q}
              onChange={(event) => {
                onPatchFilters({ q: event.target.value });
              }}
            />
          </label>

          <label>
            Repo (CSV)
            <input
              id={TRIAGE_CONTROL_IDS.filterRepo}
              data-control-id={TRIAGE_CONTROL_IDS.filterRepo}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterRepo}
              type="text"
              placeholder="owner/repo"
              value={filters.repo}
              onChange={(event) => {
                onPatchFilters({ repo: event.target.value });
              }}
            />
          </label>

          <label>
            Author (CSV)
            <input
              id={TRIAGE_CONTROL_IDS.filterAuthor}
              data-control-id={TRIAGE_CONTROL_IDS.filterAuthor}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterAuthor}
              type="text"
              placeholder="octocat"
              value={filters.author}
              onChange={(event) => {
                onPatchFilters({ author: event.target.value });
              }}
            />
          </label>

          <label>
            Review state
            <select
              id={TRIAGE_CONTROL_IDS.filterReviewState}
              data-control-id={TRIAGE_CONTROL_IDS.filterReviewState}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterReviewState}
              value={filters.reviewState}
              onChange={(event) => {
                onPatchFilters({ reviewState: event.target.value as Filters["reviewState"] });
              }}
            >
              {REVIEW_STATE_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value || "Any"}
                </option>
              ))}
            </select>
          </label>

          <label>
            CI state
            <select
              id={TRIAGE_CONTROL_IDS.filterCiState}
              data-control-id={TRIAGE_CONTROL_IDS.filterCiState}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterCiState}
              value={filters.ciState}
              onChange={(event) => {
                onPatchFilters({ ciState: event.target.value as Filters["ciState"] });
              }}
            >
              {CI_STATE_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value || "Any"}
                </option>
              ))}
            </select>
          </label>

          <label>
            Draft
            <select
              id={TRIAGE_CONTROL_IDS.filterDraft}
              data-control-id={TRIAGE_CONTROL_IDS.filterDraft}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterDraft}
              value={filters.draft}
              onChange={(event) => {
                onPatchFilters({ draft: event.target.value as Filters["draft"] });
              }}
            >
              <option value="all">All</option>
              <option value="false">Non-draft</option>
              <option value="true">Draft only</option>
            </select>
          </label>

          <label>
            Sort
            <select
              id={TRIAGE_CONTROL_IDS.filterSort}
              data-control-id={TRIAGE_CONTROL_IDS.filterSort}
              data-shortcut-target={TRIAGE_CONTROL_IDS.filterSort}
              value={filters.sort}
              onChange={(event) => {
                onPatchFilters({ sort: event.target.value as Filters["sort"] });
              }}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            id={TRIAGE_CONTROL_IDS.clearFilters}
            data-control-id={TRIAGE_CONTROL_IDS.clearFilters}
            data-shortcut-target={TRIAGE_CONTROL_IDS.clearFilters}
            type="button"
            className={styles.clearButton}
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </section>
      </div>

      <div className={styles.listBody}>
        {inboxLoading && <p className={styles.subtleText}>Loading inbox...</p>}

        {!inboxLoading && !inbox?.items.length && (
          <p className={styles.subtleText}>No pull requests match these filters.</p>
        )}

        {inbox?.items.map((item) => {
          const isActive = item.id === selectedId;
          const controlId = inboxItemControlId(item.id);

          return (
            <button
              key={item.id}
              id={controlId}
              data-control-id={controlId}
              data-shortcut-target={controlId}
              type="button"
              className={clsx(styles.listItem, isActive && styles.listItemActive)}
              aria-pressed={isActive}
              onClick={() => {
                onSelectPullRequest(item.id);
              }}
            >
              <div className={styles.listItemTitleRow}>
                <span>{item.repository}</span>
                <span className={clsx(styles.urgencyPill, getUrgencyClassName(item.urgencyScore))}>
                  {Math.round(item.urgencyScore)}
                </span>
              </div>
              <p className={styles.listItemTitle}>#{item.number} {item.title}</p>
              <p className={styles.listItemMeta}>
                {item.reviewState} | CI {item.ciState} | {new Date(item.updatedAt).toLocaleDateString()}
              </p>
              {item.attentionReason && <p className={styles.listItemReason}>{item.attentionReason}</p>}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
