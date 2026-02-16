import { writeActionLog } from "@/lib/action-log";
import { getCachedResult, setCachedResult } from "@/lib/ai-cache";
import { runCodexJson } from "@/lib/codex-client";
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
import type { AiSummary } from "@/types/pr";

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    summary: { type: "string", description: "2-3 sentence summary of the PR" },
    keyChanges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          file: { type: "string" },
          description: { type: "string" },
        },
        required: ["file", "description"],
      },
    },
    changeType: {
      type: "string",
      enum: ["feature", "bugfix", "refactor", "docs", "chore", "other"],
    },
  },
  required: ["summary", "keyChanges", "changeType"],
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

  const cached = await getCachedResult<AiSummary>("ai_summary", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  const pr = await prisma.pullRequest.findUnique({
    where: { id },
    select: { title: true, body: true },
  });
  if (!pr) {
    return fail("Pull request not found", undefined, 404);
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const diffCtx = await buildPrContext(
      octokit,
      prContext.owner,
      prContext.repo,
      prContext.number,
      pr.title,
      pr.body,
    );

    const contextDoc = formatPrContextForCodex(diffCtx);

    const result = await runCodexJson<AiSummary>({
      prompt:
        "Analyze the pull request context provided and generate a concise summary. " +
        "Return a JSON object with: summary (2-3 sentences describing what this PR does), " +
        "keyChanges (array of {file, description} for the most important changes), " +
        "and changeType (one of: feature, bugfix, refactor, docs, chore, other).",
      outputSchema: OUTPUT_SCHEMA,
      contextContent: contextDoc,
      contextFilename: "pr-context.md",
    });

    await setCachedResult("ai_summary", result, { pullRequestId: id });

    await writeActionLog({
      actionType: "AI_SUMMARY",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ ...result, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_SUMMARY",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to generate AI summary",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}

export async function GET(
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

  const cached = await getCachedResult<AiSummary>("ai_summary", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  return ok({ summary: null, cached: false });
}
