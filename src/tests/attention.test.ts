import { calculateUrgencyScore, deriveAttentionReason } from "@/lib/attention";
import { describe, expect, it, vi } from "vitest";

describe("calculateUrgencyScore", () => {
  it("applies boosts and penalties with staleness", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore({
      reviewRequested: true,
      assignedToMe: true,
      ciState: "FAILURE",
      isDraft: false,
      updatedAt: new Date("2026-02-13T12:00:00.000Z"),
      mentionCount: 2,
    });

    expect(score).toEqual({
      reviewRequestBoost: 35,
      assigneeBoost: 25,
      ciPenalty: 20,
      stalenessBoost: 6,
      draftPenalty: 0,
      mentionBoost: 10,
      finalScore: 96,
    });
  });

  it("caps staleness and mention boosts, and clamps final score to zero", () => {
    const now = new Date("2026-02-14T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const score = calculateUrgencyScore({
      reviewRequested: false,
      assignedToMe: false,
      ciState: "SUCCESS",
      isDraft: true,
      updatedAt: new Date("2025-12-01T00:00:00.000Z"),
      mentionCount: 20,
    });

    expect(score.stalenessBoost).toBe(30);
    expect(score.mentionBoost).toBe(20);
    expect(score.finalScore).toBe(25);

    const zeroed = calculateUrgencyScore({
      reviewRequested: false,
      assignedToMe: false,
      ciState: "SUCCESS",
      isDraft: true,
      updatedAt: now,
      mentionCount: 0,
    });

    expect(zeroed.finalScore).toBe(0);
  });
});

describe("deriveAttentionReason", () => {
  it("prioritizes review requests over other reasons", () => {
    const reason = deriveAttentionReason({
      reviewRequested: true,
      assignedToMe: true,
      ciState: "FAILURE",
      isDraft: false,
      updatedAt: new Date(),
    });

    expect(reason).toBe("Review requested");
  });

  it("falls back to assignment and ci failure", () => {
    const assigned = deriveAttentionReason({
      reviewRequested: false,
      assignedToMe: true,
      ciState: "SUCCESS",
      isDraft: false,
      updatedAt: new Date(),
    });

    const failing = deriveAttentionReason({
      reviewRequested: false,
      assignedToMe: false,
      ciState: "FAILURE",
      isDraft: false,
      updatedAt: new Date(),
    });

    expect(assigned).toBe("Assigned to you");
    expect(failing).toBe("CI failing");
  });
});
