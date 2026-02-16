import type { CiState } from "@/types/pr";
import type { AttentionScoreBreakdown } from "@/types/pr";

export interface AttentionInput {
  reviewRequested: boolean;
  assignedToMe: boolean;
  ciState: CiState;
  isDraft: boolean;
  updatedAt: Date;
  mentionCount?: number;
}

export function calculateUrgencyScore(
  input: AttentionInput,
): AttentionScoreBreakdown {
  const now = Date.now();
  const hoursStale = Math.max(
    0,
    (now - input.updatedAt.getTime()) / (1000 * 60 * 60),
  );

  const reviewRequestBoost = input.reviewRequested ? 35 : 0;
  const assigneeBoost = input.assignedToMe ? 25 : 0;
  const ciPenalty =
    input.ciState === "FAILURE"
      ? 20
      : input.ciState === "PENDING"
        ? 8
        : 0;
  const stalenessBoost = Math.min(30, Math.floor(hoursStale / 4));
  const draftPenalty = input.isDraft ? 25 : 0;
  const mentionBoost = Math.min(20, (input.mentionCount ?? 0) * 5);

  const finalScore = Math.max(
    0,
    reviewRequestBoost +
      assigneeBoost +
      ciPenalty +
      stalenessBoost +
      mentionBoost -
      draftPenalty,
  );

  return {
    reviewRequestBoost,
    assigneeBoost,
    ciPenalty,
    stalenessBoost,
    draftPenalty,
    mentionBoost,
    finalScore,
  };
}

export function deriveAttentionReason(input: AttentionInput): string | null {
  if (input.reviewRequested) {
    return "Review requested";
  }

  if (input.assignedToMe) {
    return "Assigned to you";
  }

  if (input.ciState === "FAILURE") {
    return "CI failing";
  }

  return null;
}
