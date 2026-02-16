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
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RiskAssessment } from "@/types/pr";

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    riskLevel: {
      type: "string",
      enum: ["low", "medium", "high", "critical"],
    },
    riskFactors: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["security", "data", "api", "infrastructure", "quality"],
          },
          description: { type: "string" },
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
        required: ["category", "description", "severity"],
      },
    },
    explanation: { type: "string" },
  },
  required: ["riskLevel", "riskFactors", "explanation"],
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

  const cached = await getCachedResult<RiskAssessment>("ai_risk_assessment", id);
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

    const result = await runCodexJson<RiskAssessment>({
      prompt:
        "Analyze the pull request diff for potential risks. Evaluate each of these risk categories: " +
        "security (auth, crypto, permissions, env files), " +
        "data (database migrations, schema changes, data deletion), " +
        "api (endpoint changes, breaking response shape changes), " +
        "infrastructure (CI/CD config, Docker, deployment), " +
        "quality (deleted tests, reduced coverage, disabled linting). " +
        "Return a JSON object with: riskLevel (low/medium/high/critical), " +
        "riskFactors (array of {category, description, severity}), " +
        "and explanation (brief overall risk explanation). " +
        "Only include risk factors that actually apply to this PR.",
      outputSchema: OUTPUT_SCHEMA,
      contextContent: contextDoc,
      contextFilename: "pr-context.md",
    });

    await setCachedResult("ai_risk_assessment", result, { pullRequestId: id });

    // Store risk level on the attention record
    await prisma.pullRequestAttention.updateMany({
      where: { pullRequestId: id },
      data: {
        riskLevel: result.riskLevel,
        riskFactors: JSON.parse(JSON.stringify(result.riskFactors)) as Prisma.InputJsonValue,
      },
    });

    await writeActionLog({
      actionType: "AI_RISK_ASSESSMENT",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ ...result, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_RISK_ASSESSMENT",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to generate risk assessment",
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

  const cached = await getCachedResult<RiskAssessment>("ai_risk_assessment", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  return ok({ riskLevel: null, cached: false });
}
