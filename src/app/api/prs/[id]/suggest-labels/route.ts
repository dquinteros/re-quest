import { writeActionLog } from "@/lib/action-log";
import { getCachedResult, setCachedResult } from "@/lib/ai-cache";
import { safeRunCodexJson } from "@/lib/safe-codex";
import { suggestLabelsResultSchema, validateAiResponse } from "@/lib/ai-validators";
import { buildPrContext, formatPrContextForCodex } from "@/lib/github-diff";
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
import type { LabelSuggestion } from "@/types/pr";

interface SuggestLabelsResult {
  suggestedLabels: LabelSuggestion[];
}

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    suggestedLabels: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
        required: ["name", "confidence", "reason"],
        additionalProperties: false,
      },
    },
  },
  required: ["suggestedLabels"],
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
  if (!userSettings.ai.enabledFeatures.labels) {
    return fail("Label Suggestions are disabled in settings", undefined, 400);
  }

  const cached = await getCachedResult<SuggestLabelsResult>("ai_label_suggest", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  const pr = await prisma.pullRequest.findUnique({
    where: { id },
    select: { title: true, body: true, labels: true },
  });
  if (!pr) {
    return fail("Pull request not found", undefined, 404);
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    // Fetch available labels from the repository
    const repoLabels = await octokit.rest.issues.listLabelsForRepo({
      owner: prContext.owner,
      repo: prContext.repo,
      per_page: 100,
    });
    const availableLabelNames = repoLabels.data.map((l) => l.name);

    const currentLabels = Array.isArray(pr.labels)
      ? (pr.labels as string[])
      : [];

    const diffCtx = await buildPrContext(
      octokit,
      prContext.owner,
      prContext.repo,
      prContext.number,
      pr.title,
      pr.body,
    );

    const contextDoc = [
      formatPrContextForCodex(diffCtx),
      "",
      "## Available Labels in Repository",
      availableLabelNames.map((l) => `- ${l}`).join("\n"),
      "",
      "## Currently Applied Labels",
      currentLabels.length > 0
        ? currentLabels.map((l) => `- ${l}`).join("\n")
        : "(none)",
    ].join("\n");

    const result = await safeRunCodexJson<SuggestLabelsResult>({
      prompt:
        "Analyze the pull request and suggest which labels should be applied. " +
        "ONLY suggest labels that exist in the 'Available Labels in Repository' list. " +
        "Do NOT suggest labels that are already applied. " +
        "For each suggestion, include a confidence score (0-1) and a brief reason. " +
        "Return a JSON object with: suggestedLabels (array of {name, confidence, reason}).",
      outputSchema: OUTPUT_SCHEMA,
      contextContent: contextDoc,
      contextFilename: "pr-labels-context.md",
      model: userSettings.ai.model || undefined,
      timeout: userSettings.ai.timeoutMs,
      validate: (data) => validateAiResponse(suggestLabelsResultSchema, data, "Label Suggestions"),
    }, { feature: "ai_label_suggest" });

    await setCachedResult("ai_label_suggest", result, {
      pullRequestId: id,
      ttlHours: userSettings.cache.ttlHours.ai_label_suggest,
    });

    await writeActionLog({
      actionType: "AI_LABEL_SUGGEST",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ ...result, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_LABEL_SUGGEST",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to suggest labels",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
