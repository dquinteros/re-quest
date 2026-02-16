import type {
  PullRequest as PrismaPullRequest,
  PullRequestAttention,
  Repository,
} from "@prisma/client";
import type { AttentionScoreBreakdown, FlowViolationInfo, PullRequestDetail, PullRequestListItem } from "@/types/pr";
import { validatePrFlow, getFlowPhase, DEFAULT_FLOW_RULES, type FlowRule } from "@/lib/git-flow";

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

function computeFlowFields(
  headRef: string | null,
  baseRef: string | null,
  rules: FlowRule[],
): { flowPhase: string | null; flowViolation: FlowViolationInfo | null } {
  if (!headRef || !baseRef) {
    return { flowPhase: null, flowViolation: null };
  }

  const violation = validatePrFlow(headRef, baseRef, rules);
  const phase = getFlowPhase(headRef, baseRef);

  return {
    flowPhase: phase,
    flowViolation: violation
      ? { expectedTargets: violation.expectedTargets, message: violation.message }
      : null,
  };
}

export function toPullRequestListItem(
  record: PullRequestRecord,
  flowRules?: FlowRule[],
): PullRequestListItem {
  const rules = flowRules ?? DEFAULT_FLOW_RULES;
  const { flowPhase, flowViolation } = computeFlowFields(
    record.headRef,
    record.baseRef,
    rules,
  );

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
    headRef: record.headRef,
    baseRef: record.baseRef,
    flowPhase,
    flowViolation,
  };
}

export function toPullRequestDetail(
  record: PullRequestRecord,
  flowRules?: FlowRule[],
): PullRequestDetail {
  const base = toPullRequestListItem(record, flowRules);

  return {
    ...base,
    body: record.body,
    projects: stringArrayFromJson(record.projects),
    scoreBreakdown: scoreBreakdownFromJson(record.attentionState?.scoreBreakdown),
  };
}
