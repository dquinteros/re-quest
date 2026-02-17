import type { CiState, ReviewState } from "@/types/pr";
import type { AttentionScoreBreakdown } from "@/types/pr";
import type { ScoringWeights } from "@/lib/settings";
import { DEFAULT_SCORING_WEIGHTS } from "@/lib/settings";

export interface AttentionInput {
  reviewRequested: boolean;
  assignedToMe: boolean;
  ciState: CiState;
  isDraft: boolean;
  updatedAt: Date;
  createdAt: Date;
  isMergeable: boolean | null;
  reviewState: ReviewState;
  additions: number | null;
  deletions: number | null;
  commentCount: number | null;
  commitCount: number | null;
  mentionCount?: number;
  lastActivityByViewer?: boolean;
}

export function calculateUrgencyScore(
  input: AttentionInput,
  weights?: Partial<ScoringWeights>,
): AttentionScoreBreakdown {
  const w = { ...DEFAULT_SCORING_WEIGHTS, ...weights };

  const now = Date.now();
  const hoursStale = Math.max(
    0,
    (now - input.updatedAt.getTime()) / (1000 * 60 * 60),
  );

  const reviewRequestBoost = input.reviewRequested ? w.reviewRequestBoost : 0;
  const assigneeBoost = input.assignedToMe ? w.assigneeBoost : 0;
  const ciPenalty =
    input.ciState === "FAILURE"
      ? w.ciFailurePenalty
      : input.ciState === "PENDING"
        ? w.ciPendingPenalty
        : input.ciState === "UNKNOWN"
          ? Math.round(w.ciPendingPenalty * 0.6)
          : 0;
  const stalenessBoost = Math.min(w.stalenessMaxBoost, Math.floor(hoursStale / 4));
  const draftPenalty = input.isDraft ? w.draftPenalty : 0;
  const mentionBoost = Math.min(20, (input.mentionCount ?? 0) * w.mentionBoostPerMention);

  const totalLines = (input.additions ?? 0) + (input.deletions ?? 0);
  const sizeBoost = Math.min(20, Math.floor(Math.log2(totalLines + 1) * 2));

  const activityBoost = Math.min(15, (input.commentCount ?? 0) * 2);

  const commitBoost = Math.min(10, input.commitCount ?? 0);

  const myLastActivityPenalty = input.lastActivityByViewer ? w.myLastActivityPenalty : 0;

  const finalScore = Math.max(
    0,
    reviewRequestBoost +
      assigneeBoost +
      ciPenalty +
      stalenessBoost +
      mentionBoost +
      sizeBoost +
      activityBoost +
      commitBoost -
      draftPenalty -
      myLastActivityPenalty,
  );

  return {
    reviewRequestBoost,
    assigneeBoost,
    ciPenalty,
    stalenessBoost,
    draftPenalty,
    mentionBoost,
    sizeBoost,
    activityBoost,
    commitBoost,
    myLastActivityPenalty,
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

  if (input.isMergeable === false) {
    return "Has merge conflicts";
  }

  if (input.reviewState === "CHANGES_REQUESTED") {
    return "Changes requested";
  }

  if (input.ciState === "FAILURE") {
    return "CI failing";
  }

  if (input.ciState === "UNKNOWN") {
    return "CI status unknown";
  }

  return null;
}
