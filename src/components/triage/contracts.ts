export type ReviewEvent = "APPROVE" | "COMMENT" | "REQUEST_CHANGES";

export type PendingReviewMode = "pending_create" | "pending_submit" | "pending_delete";

export type MutateTarget = "labels" | "assignees" | "reviewers";

export interface Filters {
  q: string;
  repo: string;
  author: string;
  reviewState:
    | ""
    | "REVIEW_REQUESTED"
    | "CHANGES_REQUESTED"
    | "APPROVED"
    | "COMMENTED"
    | "UNREVIEWED"
    | "DRAFT";
  ciState: "" | "FAILURE" | "PENDING" | "SUCCESS" | "UNKNOWN";
  draft: "all" | "true" | "false";
  sort: "urgency" | "updated_desc" | "updated_asc" | "created_desc" | "created_asc";
}

export const DEFAULT_FILTERS: Filters = {
  q: "",
  repo: "",
  author: "",
  reviewState: "",
  ciState: "",
  draft: "all",
  sort: "urgency",
};

export const SORT_OPTIONS: Array<{ value: Filters["sort"]; label: string }> = [
  { value: "urgency", label: "Urgency" },
  { value: "updated_desc", label: "Updated (newest)" },
  { value: "updated_asc", label: "Updated (oldest)" },
  { value: "created_desc", label: "Created (newest)" },
  { value: "created_asc", label: "Created (oldest)" },
];

export const REVIEW_STATE_OPTIONS = [
  "",
  "REVIEW_REQUESTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "COMMENTED",
  "UNREVIEWED",
  "DRAFT",
] as const;

export const CI_STATE_OPTIONS = ["", "FAILURE", "PENDING", "SUCCESS", "UNKNOWN"] as const;

export type InboxPresetKey =
  | "needs_review"
  | "changes_requested"
  | "failing_ci"
  | "draft_only";

export interface InboxPreset {
  key: InboxPresetKey;
  label: string;
  filters: Partial<Filters>;
}

export const INBOX_PRESETS: InboxPreset[] = [
  {
    key: "needs_review",
    label: "Needs review",
    filters: { reviewState: "REVIEW_REQUESTED", draft: "false" },
  },
  {
    key: "changes_requested",
    label: "Changes requested",
    filters: { reviewState: "CHANGES_REQUESTED" },
  },
  {
    key: "failing_ci",
    label: "Failing CI",
    filters: { ciState: "FAILURE" },
  },
  {
    key: "draft_only",
    label: "Draft only",
    filters: { draft: "true" },
  },
];

const INVALID_ID_CHARS = /[^a-zA-Z0-9_-]/g;

export function toStableId(prefix: string, rawValue: string): string {
  const normalized = rawValue.toLowerCase().replace(INVALID_ID_CHARS, "-").replace(/-+/g, "-");
  const trimmed = normalized.replace(/^-|-$/g, "");
  return trimmed ? `${prefix}-${trimmed}` : `${prefix}-value`;
}

export const TRIAGE_CONTROL_IDS = {
  inboxPanel: "triage-inbox-panel",
  detailPanel: "triage-detail-panel",
  shortcutsHelpButton: "triage-shortcuts-help-button",
  shortcutsHelpDialog: "triage-shortcuts-help-dialog",
  repoSearchInput: "triage-repo-search-input",
  repoOrgFilter: "triage-repo-org-filter",
  refreshFromGithub: "triage-refresh",
  signOut: "triage-sign-out",
  filterSearch: "triage-filter-search",
  filterRepo: "triage-filter-repo",
  filterAuthor: "triage-filter-author",
  filterReviewState: "triage-filter-review-state",
  filterCiState: "triage-filter-ci-state",
  filterDraft: "triage-filter-draft",
  filterSort: "triage-filter-sort",
  filterToggle: "triage-filter-toggle",
  clearFilters: "triage-filter-clear",
  commentBody: "triage-comment-body",
  commentSubmit: "triage-comment-submit",
  reviewEvent: "triage-review-event",
  reviewBody: "triage-review-body",
  reviewQuickSubmit: "triage-review-quick-submit",
  openOnGithub: "triage-open-on-github",
  advancedActionsToggle: "triage-advanced-actions-toggle",
  pendingReviewMode: "triage-pending-review-mode",
  pendingReviewId: "triage-pending-review-id",
  pendingReviewSubmit: "triage-pending-review-submit",
  labelInput: "triage-label-input",
  labelAdd: "triage-label-add",
  labelRemove: "triage-label-remove",
  assigneeInput: "triage-assignee-input",
  assigneeAdd: "triage-assignee-add",
  assigneeRemove: "triage-assignee-remove",
  reviewerInput: "triage-reviewer-input",
  reviewerAdd: "triage-reviewer-add",
  reviewerRemove: "triage-reviewer-remove",
  propertiesTitle: "triage-properties-title",
  propertiesBody: "triage-properties-body",
  propertiesState: "triage-properties-state",
  propertiesMilestone: "triage-properties-milestone",
  propertiesProjects: "triage-properties-projects",
  propertiesSubmit: "triage-properties-submit",
  aiReviewRun: "triage-ai-review-run",
} as const;

export function inboxItemControlId(itemId: string): string {
  return toStableId("triage-inbox-item", itemId);
}

export function repoToggleControlId(fullName: string): string {
  return toStableId("triage-repo-toggle", fullName);
}

export function presetControlId(key: InboxPresetKey): string {
  return `triage-preset-${key}`;
}
