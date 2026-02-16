import type { CiState, Prisma, ReviewState } from "@prisma/client";
import { prisma } from "@/lib/db";
import { calculateUrgencyScore, deriveAttentionReason } from "@/lib/attention";

const STALE_ATTENTION_THRESHOLD = 20;

export interface UpsertAttentionStateInput {
  pullRequestId: string;
  reviewState: ReviewState;
  ciState: CiState;
  isDraft: boolean;
  updatedAt: Date;
  assignees: string[];
  requestedReviewers: string[];
  body: string | null;
  viewerLogin: string | null;
}

function mentionCount(text: string, login: string | null): number {
  if (!login) {
    return 0;
  }

  const escaped = login.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = text.match(new RegExp(`@${escaped}\\b`, "gi"));
  return matches?.length ?? 0;
}

function hasCaseInsensitiveMatch(values: string[], expected: string): boolean {
  const needle = expected.toLowerCase();
  return values.some((value) => value.toLowerCase() === needle);
}

export function buildAttentionState(input: Omit<UpsertAttentionStateInput, "pullRequestId">): {
  needsAttention: boolean;
  attentionReason: string | null;
  urgencyScore: number;
  scoreBreakdown: Prisma.InputJsonValue;
} {
  const viewerLogin = input.viewerLogin?.trim() ? input.viewerLogin.trim() : null;

  const assignedToMe = viewerLogin
    ? hasCaseInsensitiveMatch(input.assignees, viewerLogin)
    : false;

  const reviewRequested = viewerLogin
    ? hasCaseInsensitiveMatch(input.requestedReviewers, viewerLogin)
    : input.reviewState === "REVIEW_REQUESTED";

  const scoringInput = {
    reviewRequested,
    assignedToMe,
    ciState: input.ciState,
    isDraft: input.isDraft,
    updatedAt: input.updatedAt,
    mentionCount: mentionCount(input.body ?? "", viewerLogin),
  };

  const score = calculateUrgencyScore(scoringInput);
  const fallbackReason =
    score.finalScore >= STALE_ATTENTION_THRESHOLD ? "Stale pull request" : null;
  const attentionReason = deriveAttentionReason(scoringInput) ?? fallbackReason;
  const needsAttention =
    reviewRequested ||
    assignedToMe ||
    input.ciState === "FAILURE" ||
    score.finalScore >= STALE_ATTENTION_THRESHOLD;

  return {
    needsAttention,
    attentionReason,
    urgencyScore: score.finalScore,
    scoreBreakdown: score as unknown as Prisma.InputJsonValue,
  };
}

export async function upsertAttentionState(input: UpsertAttentionStateInput): Promise<void> {
  const attention = buildAttentionState({
    reviewState: input.reviewState,
    ciState: input.ciState,
    isDraft: input.isDraft,
    updatedAt: input.updatedAt,
    assignees: input.assignees,
    requestedReviewers: input.requestedReviewers,
    body: input.body,
    viewerLogin: input.viewerLogin,
  });

  const now = new Date();
  await prisma.pullRequestAttention.upsert({
    where: { pullRequestId: input.pullRequestId },
    create: {
      pullRequestId: input.pullRequestId,
      needsAttention: attention.needsAttention,
      attentionReason: attention.attentionReason,
      urgencyScore: attention.urgencyScore,
      scoreBreakdown: attention.scoreBreakdown,
      lastSyncedAt: now,
    },
    update: {
      needsAttention: attention.needsAttention,
      attentionReason: attention.attentionReason,
      urgencyScore: attention.urgencyScore,
      scoreBreakdown: attention.scoreBreakdown,
      lastSyncedAt: now,
    },
  });
}
