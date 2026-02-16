import { writeActionLog } from "@/lib/action-log";
import { getCachedResult, setCachedResult } from "@/lib/ai-cache";
import { runCodexJson } from "@/lib/codex-client";
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
import type { ReviewerSuggestion } from "@/types/pr";

interface SuggestReviewersResult {
  suggestedReviewers: ReviewerSuggestion[];
}

const OUTPUT_SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    suggestedReviewers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          login: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          reasons: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["login", "score", "reasons"],
      },
    },
  },
  required: ["suggestedReviewers"],
});

async function gatherReviewerContext(
  octokit: InstanceType<typeof import("@octokit/rest").Octokit>,
  owner: string,
  repo: string,
  pullNumber: number,
  repositoryId: string,
): Promise<string> {
  const sections: string[] = [];

  // Fetch changed files for this PR
  const changedFiles = await fetchPrChangedFiles(octokit, owner, repo, pullNumber);
  sections.push("## Changed Files in This PR");
  sections.push(changedFiles.map((f) => `- ${f}`).join("\n"));

  // Fetch collaborators
  try {
    const collaborators = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      per_page: 50,
    });
    sections.push("\n## Repository Collaborators");
    sections.push(
      collaborators.data
        .map((c) => `- ${c.login} (permissions: ${c.role_name ?? "unknown"})`)
        .join("\n"),
    );
  } catch {
    // May lack permission; skip
  }

  // Fetch recent PR reviews from stored data to infer reviewer activity
  const recentPrs = await prisma.pullRequest.findMany({
    where: {
      repositoryId,
      state: "OPEN",
    },
    select: {
      number: true,
      authorLogin: true,
      requestedReviewers: true,
      reviewState: true,
    },
    take: 30,
    orderBy: { githubUpdatedAt: "desc" },
  });

  const reviewerWorkload: Record<string, number> = {};
  for (const pr of recentPrs) {
    const reviewers = Array.isArray(pr.requestedReviewers)
      ? (pr.requestedReviewers as string[])
      : [];
    for (const r of reviewers) {
      reviewerWorkload[r] = (reviewerWorkload[r] ?? 0) + 1;
    }
  }

  sections.push("\n## Current Reviewer Workload (open review requests)");
  const workloadEntries = Object.entries(reviewerWorkload).sort(([, a], [, b]) => b - a);
  if (workloadEntries.length > 0) {
    sections.push(workloadEntries.map(([login, count]) => `- ${login}: ${count} open reviews`).join("\n"));
  } else {
    sections.push("(no open review requests found)");
  }

  // Get blame data for changed files (first 5 files to stay within limits)
  const blameFiles = changedFiles.slice(0, 5);
  const blameAuthors: Record<string, number> = {};

  for (const file of blameFiles) {
    try {
      const commits = await octokit.rest.repos.listCommits({
        owner,
        repo,
        path: file,
        per_page: 10,
      });
      for (const commit of commits.data) {
        const login = commit.author?.login;
        if (login) {
          blameAuthors[login] = (blameAuthors[login] ?? 0) + 1;
        }
      }
    } catch {
      // Skip files we can't get history for
    }
  }

  sections.push("\n## Code Ownership (recent commit authors for changed files)");
  const ownershipEntries = Object.entries(blameAuthors).sort(([, a], [, b]) => b - a);
  if (ownershipEntries.length > 0) {
    sections.push(ownershipEntries.map(([login, count]) => `- ${login}: ${count} recent commits`).join("\n"));
  } else {
    sections.push("(no ownership data available)");
  }

  return sections.join("\n");
}

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

  const cached = await getCachedResult<SuggestReviewersResult>("ai_reviewer_suggest", id);
  if (cached) {
    return ok({ ...cached, cached: true });
  }

  const pr = await prisma.pullRequest.findUnique({
    where: { id },
    select: { authorLogin: true, requestedReviewers: true },
  });
  if (!pr) {
    return fail("Pull request not found", undefined, 404);
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const contextDoc = await gatherReviewerContext(
      octokit,
      prContext.owner,
      prContext.repo,
      prContext.number,
      prContext.repositoryId,
    );

    const currentReviewers = Array.isArray(pr.requestedReviewers)
      ? (pr.requestedReviewers as string[])
      : [];

    const fullContext = [
      `# Reviewer Suggestion Context`,
      ``,
      `PR Author: ${pr.authorLogin}`,
      `Already Requested: ${currentReviewers.join(", ") || "(none)"}`,
      ``,
      contextDoc,
    ].join("\n");

    const result = await runCodexJson<SuggestReviewersResult>({
      prompt:
        "Based on the code ownership, reviewer workload, and collaborator data, suggest the best 3 reviewers for this pull request. " +
        "Do NOT suggest the PR author. " +
        "Do NOT suggest people who are already requested as reviewers. " +
        "Prioritize people who have recently committed to the changed files and have lower current workload. " +
        "Return a JSON object with: suggestedReviewers (array of {login, score (0-100), reasons (array of strings)}).",
      outputSchema: OUTPUT_SCHEMA,
      contextContent: fullContext,
      contextFilename: "reviewer-context.md",
    });

    await setCachedResult("ai_reviewer_suggest", result, { pullRequestId: id });

    await writeActionLog({
      actionType: "AI_REVIEWER_SUGGEST",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
    });

    return ok({ ...result, cached: false });
  } catch (error) {
    await writeActionLog({
      actionType: "AI_REVIEWER_SUGGEST",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      errorMessage: error instanceof Error ? error.message : "Unknown error",
    });

    return fail(
      "Failed to suggest reviewers",
      error instanceof Error ? error.message : "Unknown error",
      500,
    );
  }
}
