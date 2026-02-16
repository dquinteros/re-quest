import { writeActionLog } from "@/lib/action-log";
import { getCachedResult, setCachedResult } from "@/lib/ai-cache";
import { runCodex } from "@/lib/codex-client";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { prisma } from "@/lib/db";

interface DigestMetrics {
  totalOpenPrs: number;
  totalTrackedRepos: number;
  needsAttentionCount: number;
  avgUrgencyScore: number;
  prsByState: Record<string, number>;
  prsByReviewState: Record<string, number>;
  prsByCiState: Record<string, number>;
  stalePrs: Array<{ repository: string; number: number; title: string; daysSinceUpdate: number }>;
  reviewerWorkload: Array<{ login: string; count: number }>;
  authorActivity: Array<{ login: string; count: number }>;
  recentSyncStatus: string | null;
  failingCiCount: number;
  conflictCount: number;
}

async function gatherMetrics(userId: string): Promise<DigestMetrics> {
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const trackedRepos = await prisma.trackedRepository.findMany({
    where: { userId },
    select: { repositoryId: true, fullName: true },
  });

  const repoIds = trackedRepos
    .map((r) => r.repositoryId)
    .filter((id): id is string => id !== null);

  const openPrs = await prisma.pullRequest.findMany({
    where: {
      repositoryId: { in: repoIds },
      state: "OPEN",
    },
    include: {
      repository: { select: { fullName: true } },
      attentionState: true,
    },
  });

  const needsAttention = openPrs.filter((pr) => pr.attentionState?.needsAttention);
  const avgUrgency =
    openPrs.length > 0
      ? openPrs.reduce((sum, pr) => sum + (pr.attentionState?.urgencyScore ?? 0), 0) / openPrs.length
      : 0;

  const prsByState: Record<string, number> = {};
  const prsByReviewState: Record<string, number> = {};
  const prsByCiState: Record<string, number> = {};
  const reviewerMap: Record<string, number> = {};
  const authorMap: Record<string, number> = {};

  for (const pr of openPrs) {
    prsByState[pr.state] = (prsByState[pr.state] ?? 0) + 1;
    prsByReviewState[pr.reviewState] = (prsByReviewState[pr.reviewState] ?? 0) + 1;
    prsByCiState[pr.ciState] = (prsByCiState[pr.ciState] ?? 0) + 1;
    authorMap[pr.authorLogin] = (authorMap[pr.authorLogin] ?? 0) + 1;

    const reviewers = Array.isArray(pr.requestedReviewers)
      ? (pr.requestedReviewers as string[])
      : [];
    for (const r of reviewers) {
      reviewerMap[r] = (reviewerMap[r] ?? 0) + 1;
    }
  }

  const stalePrs = openPrs
    .filter((pr) => pr.githubUpdatedAt < oneWeekAgo)
    .map((pr) => ({
      repository: pr.repository.fullName,
      number: pr.number,
      title: pr.title,
      daysSinceUpdate: Math.floor(
        (Date.now() - pr.githubUpdatedAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
    }))
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate)
    .slice(0, 10);

  const lastSync = await prisma.syncRun.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { status: true },
  });

  return {
    totalOpenPrs: openPrs.length,
    totalTrackedRepos: trackedRepos.length,
    needsAttentionCount: needsAttention.length,
    avgUrgencyScore: Math.round(avgUrgency * 10) / 10,
    prsByState,
    prsByReviewState,
    prsByCiState,
    stalePrs,
    reviewerWorkload: Object.entries(reviewerMap)
      .map(([login, count]) => ({ login, count }))
      .sort((a, b) => b.count - a.count),
    authorActivity: Object.entries(authorMap)
      .map(([login, count]) => ({ login, count }))
      .sort((a, b) => b.count - a.count),
    recentSyncStatus: lastSync?.status ?? null,
    failingCiCount: prsByCiState["FAILURE"] ?? 0,
    conflictCount: openPrs.filter((pr) => pr.mergeable === false).length,
  };
}

function formatMetricsForCodex(metrics: DigestMetrics): string {
  const sections = [
    "# PR Team Metrics - Weekly Digest Input",
    "",
    `## Overview`,
    `- Total open PRs: ${metrics.totalOpenPrs}`,
    `- Tracked repositories: ${metrics.totalTrackedRepos}`,
    `- PRs needing attention: ${metrics.needsAttentionCount}`,
    `- Average urgency score: ${metrics.avgUrgencyScore}`,
    `- Failing CI: ${metrics.failingCiCount}`,
    `- Merge conflicts: ${metrics.conflictCount}`,
    "",
    `## PR States`,
    ...Object.entries(metrics.prsByState).map(([state, count]) => `- ${state}: ${count}`),
    "",
    `## Review States`,
    ...Object.entries(metrics.prsByReviewState).map(([state, count]) => `- ${state}: ${count}`),
    "",
    `## CI States`,
    ...Object.entries(metrics.prsByCiState).map(([state, count]) => `- ${state}: ${count}`),
    "",
    `## Reviewer Workload`,
    ...metrics.reviewerWorkload.map((r) => `- @${r.login}: ${r.count} open reviews`),
    "",
    `## Author Activity (open PRs)`,
    ...metrics.authorActivity.map((a) => `- @${a.login}: ${a.count} open PRs`),
    "",
    `## Stale PRs (not updated in 7+ days)`,
    ...(metrics.stalePrs.length > 0
      ? metrics.stalePrs.map(
          (pr) => `- ${pr.repository} #${pr.number}: "${pr.title}" (${pr.daysSinceUpdate} days stale)`,
        )
      : ["(none)"]),
  ];

  return sections.join("\n");
}

export async function POST(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail("Failed to authenticate", error instanceof Error ? error.message : "Unknown error", 500);
  }

  try {
    const metrics = await gatherMetrics(sessionUser.id);
    const contextDoc = formatMetricsForCodex(metrics);

    const result = await runCodex({
      prompt:
        "Analyze this team's PR metrics and generate a concise weekly digest in markdown format. Include: " +
        "1. Executive Summary (2-3 sentences about overall health), " +
        "2. Key Bottlenecks (review backlogs, CI failures, stale PRs), " +
        "3. Reviewer Workload Distribution (who is overloaded, who has capacity), " +
        "4. Stale PRs Needing Attention (list the most critical ones), " +
        "5. Actionable Recommendations (2-3 specific steps to improve). " +
        "Keep it brief and actionable. Use markdown formatting.",
      contextContent: contextDoc,
      contextFilename: "team-metrics.md",
    });

    const digestMarkdown = result.raw.trim() || "No digest generated.";

    await setCachedResult("ai_digest", { markdown: digestMarkdown, metrics }, {
      repository: "__global__",
      resultText: digestMarkdown,
      ttlHours: 4,
    });

    await writeActionLog({
      actionType: "AI_DIGEST",
      resultStatus: "SUCCESS",
      repository: "__global__",
      actorLogin: sessionUser.login,
    });

    return ok({ markdown: digestMarkdown, metrics, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_DIGEST",
      resultStatus: "FAILED",
      repository: "__global__",
      actorLogin: sessionUser.login,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to generate digest",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function GET(request: Request) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail("Failed to authenticate", error instanceof Error ? error.message : "Unknown error", 500);
  }

  const metrics = await gatherMetrics(sessionUser.id);

  const cached = await getCachedResult<{ markdown: string }>(
    "ai_digest",
    undefined,
    "__global__",
  );

  return ok({
    markdown: cached?.markdown ?? null,
    metrics,
    cached: !!cached,
  });
}
