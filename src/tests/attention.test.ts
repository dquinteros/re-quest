import { calculateUrgencyScore, deriveAttentionReason } from "@/lib/attention";
import type { AttentionInput } from "@/lib/attention";
import { buildAttentionState } from "@/lib/pr-attention";
import { describe, expect, it, vi } from "vitest";

function baseInput(overrides: Partial<AttentionInput> = {}): AttentionInput {
  return {
    reviewRequested: false,
    assignedToMe: false,
    ciState: "SUCCESS",
    isDraft: false,
    updatedAt: new Date("2026-02-14T12:00:00.000Z"),
    createdAt: new Date("2026-02-14T12:00:00.000Z"),
    isMergeable: null,
    reviewState: "UNREVIEWED",
    additions: null,
    deletions: null,
    commentCount: null,
    commitCount: null,
    mentionCount: 0,
    lastActivityByViewer: false,
    ...overrides,
  };
}

describe("calculateUrgencyScore", () => {
  it("applies boosts and penalties with staleness", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore(
      baseInput({
        reviewRequested: true,
        assignedToMe: true,
        ciState: "FAILURE",
        updatedAt: new Date("2026-02-13T12:00:00.000Z"),
        mentionCount: 2,
      }),
    );

    expect(score).toEqual({
      reviewRequestBoost: 25,
      assigneeBoost: 20,
      ciPenalty: 15,
      stalenessBoost: 6,
      draftPenalty: 0,
      mentionBoost: 10,
      sizeBoost: 0,
      activityBoost: 0,
      commitBoost: 0,
      finalScore: 76,
    });
  });

  it("caps staleness and mention boosts, and clamps final score to zero", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore(
      baseInput({
        isDraft: true,
        updatedAt: new Date("2025-12-01T00:00:00.000Z"),
        mentionCount: 20,
      }),
    );

    expect(score.stalenessBoost).toBe(30);
    expect(score.mentionBoost).toBe(20);
    expect(score.finalScore).toBe(30);

    const zeroed = calculateUrgencyScore(
      baseInput({
        isDraft: true,
        updatedAt: now,
      }),
    );

    expect(zeroed.finalScore).toBe(0);
  });

  it("scores PR size on a logarithmic scale", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const empty = calculateUrgencyScore(
      baseInput({ additions: 0, deletions: 0 }),
    );
    expect(empty.sizeBoost).toBe(0);

    const small = calculateUrgencyScore(
      baseInput({ additions: 8, deletions: 2 }),
    );
    expect(small.sizeBoost).toBe(6);

    const medium = calculateUrgencyScore(
      baseInput({ additions: 70, deletions: 30 }),
    );
    expect(medium.sizeBoost).toBe(13);

    const large = calculateUrgencyScore(
      baseInput({ additions: 600, deletions: 400 }),
    );
    expect(large.sizeBoost).toBe(19);

    const huge = calculateUrgencyScore(
      baseInput({ additions: 5000, deletions: 5000 }),
    );
    expect(huge.sizeBoost).toBe(20);
  });

  it("scores activity based on comment count", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const none = calculateUrgencyScore(baseInput({ commentCount: 0 }));
    expect(none.activityBoost).toBe(0);

    const some = calculateUrgencyScore(baseInput({ commentCount: 3 }));
    expect(some.activityBoost).toBe(6);

    const busy = calculateUrgencyScore(baseInput({ commentCount: 5 }));
    expect(busy.activityBoost).toBe(10);

    const capped = calculateUrgencyScore(baseInput({ commentCount: 20 }));
    expect(capped.activityBoost).toBe(15);
  });

  it("scores commit count with a cap", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const few = calculateUrgencyScore(baseInput({ commitCount: 3 }));
    expect(few.commitBoost).toBe(3);

    const several = calculateUrgencyScore(baseInput({ commitCount: 7 }));
    expect(several.commitBoost).toBe(7);

    const capped = calculateUrgencyScore(baseInput({ commitCount: 15 }));
    expect(capped.commitBoost).toBe(10);
  });

  it("applies a small ciPenalty for UNKNOWN CI state", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore(
      baseInput({ ciState: "UNKNOWN", updatedAt: now }),
    );

    expect(score.ciPenalty).toBe(3);
  });

  it("treats null size/activity/commit fields as zero", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore(
      baseInput({
        additions: null,
        deletions: null,
        commentCount: null,
        commitCount: null,
      }),
    );

    expect(score.sizeBoost).toBe(0);
    expect(score.activityBoost).toBe(0);
    expect(score.commitBoost).toBe(0);
  });

  it("combines all criteria for a realistic PR", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore(
      baseInput({
        reviewRequested: true,
        updatedAt: new Date("2026-02-13T00:00:00.000Z"),
        additions: 150,
        deletions: 50,
        commentCount: 4,
        commitCount: 5,
      }),
    );

    expect(score.reviewRequestBoost).toBe(25);
    expect(score.stalenessBoost).toBe(9);
    expect(score.sizeBoost).toBe(15);
    expect(score.activityBoost).toBe(8);
    expect(score.commitBoost).toBe(5);
    expect(score.finalScore).toBe(62);
  });
});

describe("deriveAttentionReason", () => {
  it("prioritizes review requests over other reasons", () => {
    const reason = deriveAttentionReason(
      baseInput({
        reviewRequested: true,
        assignedToMe: true,
        ciState: "FAILURE",
        isMergeable: false,
        reviewState: "CHANGES_REQUESTED",
      }),
    );

    expect(reason).toBe("Review requested");
  });

  it("falls back through assignment, conflicts, changes requested, and ci failure", () => {
    const assigned = deriveAttentionReason(
      baseInput({ assignedToMe: true }),
    );
    expect(assigned).toBe("Assigned to you");

    const conflicts = deriveAttentionReason(
      baseInput({ isMergeable: false }),
    );
    expect(conflicts).toBe("Has merge conflicts");

    const changesReq = deriveAttentionReason(
      baseInput({ reviewState: "CHANGES_REQUESTED" }),
    );
    expect(changesReq).toBe("Changes requested");

    const failing = deriveAttentionReason(
      baseInput({ ciState: "FAILURE" }),
    );
    expect(failing).toBe("CI failing");
  });

  it("returns 'CI status unknown' for UNKNOWN CI state", () => {
    const reason = deriveAttentionReason(
      baseInput({ ciState: "UNKNOWN" }),
    );
    expect(reason).toBe("CI status unknown");
  });

  it("prioritizes CI failing over CI unknown", () => {
    const reason = deriveAttentionReason(
      baseInput({ ciState: "FAILURE" }),
    );
    expect(reason).toBe("CI failing");
  });

  it("returns null when no attention reason applies", () => {
    const reason = deriveAttentionReason(baseInput());
    expect(reason).toBeNull();
  });
});

describe("buildAttentionState", () => {
  it("does not set needsAttention for UNKNOWN CI alone", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const result = buildAttentionState({
      reviewState: "UNREVIEWED",
      ciState: "UNKNOWN",
      isDraft: false,
      updatedAt: now,
      createdAt: now,
      isMergeable: null,
      additions: null,
      deletions: null,
      commentCount: null,
      commitCount: null,
      labels: [],
      assignees: [],
      requestedReviewers: [],
      body: null,
      viewerLogin: null,
    });

    expect(result.needsAttention).toBe(false);
    expect(result.attentionReason).toBe("CI status unknown");
    expect(result.urgencyScore).toBe(3);
  });
});
