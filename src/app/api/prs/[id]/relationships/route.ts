import { writeActionLog } from "@/lib/action-log";
import { getCachedResult, setCachedResult } from "@/lib/ai-cache";
import { safeRunCodexJson } from "@/lib/safe-codex";
import { relationshipsResultSchema, validateAiResponse } from "@/lib/ai-validators";
import { fetchPrChangedFiles } from "@/lib/github-diff";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";
import { prisma } from "@/lib/db";
import { getUserSettings } from "@/lib/settings";

interface PrOverview {
  id: string;
  number: number;
  title: string;
  authorLogin: string;
  headRef: string | null;
  baseRef: string | null;
  changedFiles: string[];
}

interface RelationshipItem {
  prNumberA: number;
  prNumberB: number;
  type: "related" | "depends-on" | "conflicts";
  reason: string;
}

interface RelationshipsResult {
  relationships: RelationshipItem[];
}

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    relationships: {
      type: "array",
      items: {
        type: "object",
        properties: {
          prNumberA: { type: "number" },
          prNumberB: { type: "number" },
          type: { type: "string", enum: ["related", "depends-on", "conflicts"] },
          reason: { type: "string" },
        },
        required: ["prNumberA", "prNumberB", "type", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["relationships"],
  additionalProperties: false,
});

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser;
  try {
    sessionUser = await requireAuthenticatedSessionUser(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }
    return fail("Failed to authenticate", error instanceof Error ? error.message : "Unknown error", 500);
  }

  const { id } = await resolveRouteParams(context);
  const prContext = await getPullRequestGitHubContext(id, sessionUser.id);
  if (!prContext) {
    return fail("Pull request not found", undefined, 404);
  }

  const userSettings = await getUserSettings(sessionUser.id);
  if (!userSettings.ai.enabledFeatures.relationships) {
    return fail("PR Relationships are disabled in settings", undefined, 400);
  }

  const cached = await getCachedResult<RelationshipsResult>("ai_dependency_detection", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    // Get all open PRs in the same repository
    const openPrs = await prisma.pullRequest.findMany({
      where: {
        repositoryId: prContext.repositoryId,
        state: "OPEN",
      },
      select: {
        id: true,
        number: true,
        title: true,
        authorLogin: true,
        headRef: true,
        baseRef: true,
      },
      orderBy: { number: "desc" },
      take: 20,
    });

    if (openPrs.length < 2) {
      return ok({ relationships: [], cached: false });
    }

    // Fetch changed files for each PR (limit to avoid API rate issues)
    const prOverviews: PrOverview[] = [];
    for (const pr of openPrs.slice(0, 15)) {
      try {
        const files = await fetchPrChangedFiles(
          octokit,
          prContext.owner,
          prContext.repo,
          pr.number,
        );
        prOverviews.push({ ...pr, changedFiles: files });
      } catch {
        prOverviews.push({ ...pr, changedFiles: [] });
      }
    }

    // Deterministic: compute file overlap
    const fileOverlaps: Array<{ prA: number; prB: number; sharedFiles: string[] }> = [];
    for (let i = 0; i < prOverviews.length; i++) {
      for (let j = i + 1; j < prOverviews.length; j++) {
        const a = prOverviews[i];
        const b = prOverviews[j];
        const shared = a.changedFiles.filter((f) => b.changedFiles.includes(f));
        if (shared.length > 0) {
          fileOverlaps.push({ prA: a.number, prB: b.number, sharedFiles: shared });
        }
      }
    }

    // Build context for Codex
    const contextDoc = [
      "# PR Relationship Analysis",
      "",
      `## Current PR: #${prContext.number}`,
      "",
      "## All Open PRs in Repository",
      ...prOverviews.map((pr) =>
        [
          `### PR #${pr.number}: ${pr.title}`,
          `- Author: ${pr.authorLogin}`,
          `- Branch: ${pr.headRef ?? "unknown"} -> ${pr.baseRef ?? "unknown"}`,
          `- Changed files: ${pr.changedFiles.join(", ") || "(unknown)"}`,
        ].join("\n"),
      ),
      "",
      "## Detected File Overlaps",
      ...(fileOverlaps.length > 0
        ? fileOverlaps.map(
            (o) => `- PR #${o.prA} and PR #${o.prB} share: ${o.sharedFiles.join(", ")}`,
          )
        : ["(no file overlaps detected)"]),
    ].join("\n");

    const result = await safeRunCodexJson<RelationshipsResult>({
      prompt:
        `Analyze the relationships between these open pull requests, focusing on PR #${prContext.number}. ` +
        "Identify: " +
        "1. 'related' PRs - part of the same feature or epic, " +
        "2. 'depends-on' - PRs that should be merged in a specific order, " +
        "3. 'conflicts' - PRs that modify the same areas and may conflict. " +
        `Only include relationships that involve PR #${prContext.number}. ` +
        "Use the file overlap data and branch naming patterns as evidence. " +
        "Return JSON: {relationships: [{prNumberA, prNumberB, type, reason}]}.",
      outputSchema: OUTPUT_SCHEMA,
      contextContent: contextDoc,
      contextFilename: "pr-relationships.md",
      model: userSettings.ai.model || undefined,
      timeout: userSettings.ai.timeoutMs,
      validate: (data) => validateAiResponse(relationshipsResultSchema, data, "PR Relationships"),
    }, { feature: "ai_dependency_detection" });

    await setCachedResult("ai_dependency_detection", result, {
      pullRequestId: id,
      ttlHours: userSettings.cache.ttlHours.ai_dependency_detection,
    });

    await writeActionLog({
      actionType: "AI_DEPENDENCY_DETECTION",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ ...result, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_DEPENDENCY_DETECTION",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to detect PR relationships",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
