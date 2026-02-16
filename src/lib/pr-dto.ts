import type {
  PullRequest as PrismaPullRequest,
  PullRequestAttention,
  Repository,
} from "@prisma/client";
import type { AttentionScoreBreakdown, PullRequestDetail, PullRequestListItem } from "@/types/pr";

interface PullRequestRecord extends PrismaPullRequest {
  repository: Repository;
  attentionState: PullRequestAttention | null;
}

function stringArrayFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function scoreBreakdownFromJson(value: unknown): AttentionScoreBreakdown | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const required = [
    "reviewRequestBoost",
    "assigneeBoost",
    "ciPenalty",
    "stalenessBoost",
    "draftPenalty",
    "mentionBoost",
    "finalScore",
  ];

  const allNumbers = required.every((field) => typeof record[field] === "number");
  if (!allNumbers) {
    return null;
  }

  return {
    reviewRequestBoost: record.reviewRequestBoost as number,
    assigneeBoost: record.assigneeBoost as number,
    ciPenalty: record.ciPenalty as number,
    stalenessBoost: record.stalenessBoost as number,
    draftPenalty: record.draftPenalty as number,
    mentionBoost: record.mentionBoost as number,
    finalScore: record.finalScore as number,
  };
}

export function toPullRequestListItem(record: PullRequestRecord): PullRequestListItem {
  return {
    id: record.id,
    repository: record.repository.fullName,
    number: record.number,
    title: record.title,
    url: record.url,
    state: record.state,
    draft: record.draft,
    authorLogin: record.authorLogin,
    ciState: record.ciState,
    reviewState: record.reviewState,
    labels: stringArrayFromJson(record.labels),
    assignees: stringArrayFromJson(record.assignees),
    requestedReviewers: stringArrayFromJson(record.requestedReviewers),
    milestone: record.milestone,
    updatedAt: record.githubUpdatedAt.toISOString(),
    createdAt: record.githubCreatedAt.toISOString(),
    needsAttention: record.attentionState?.needsAttention ?? false,
    attentionReason: record.attentionState?.attentionReason ?? null,
    urgencyScore: record.attentionState?.urgencyScore ?? 0,
    hasConflicts: record.mergeable === null ? null : !record.mergeable,
  };
}

export function toPullRequestDetail(record: PullRequestRecord): PullRequestDetail {
  const base = toPullRequestListItem(record);

  return {
    ...base,
    body: record.body,
    projects: stringArrayFromJson(record.projects),
    scoreBreakdown: scoreBreakdownFromJson(record.attentionState?.scoreBreakdown),
  };
}
