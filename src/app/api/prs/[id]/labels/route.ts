import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeActionLog } from "@/lib/action-log";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  type AuthenticatedSessionUser,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const labelsSchema = z
  .object({
    labels: z.array(z.string().trim().min(1)).min(1),
  })
  .strict();

function uniqueLabels(labels: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const label of labels) {
    const key = label.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalized.push(label);
  }

  return normalized;
}

async function parseBody(request: Request): Promise<z.infer<typeof labelsSchema>> {
  return labelsSchema.parse(await request.json());
}

async function authenticate(request: Request): Promise<AuthenticatedSessionUser> {
  return requireAuthenticatedSessionUser(request);
}

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
  try {
    sessionUser = await authenticate(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to authenticate request",
      error instanceof Error ? error.message : "Unknown auth error",
      500,
    );
  }

  const { id } = await resolveRouteParams(context);
  const prContext = await getPullRequestGitHubContext(id, sessionUser.id);

  if (!prContext) {
    return fail("Pull request not found", undefined, 404);
  }

  let payload: z.infer<typeof labelsSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const labels = uniqueLabels(payload.labels);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const response = await octokit.rest.issues.addLabels({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.number,
      labels,
    });

    const allLabels = response.data
      .map((label) => label.name)
      .filter((label): label is string => Boolean(label));

    await prisma.pullRequest.update({
      where: { id },
      data: {
        labels: allLabels,
        githubUpdatedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await writeActionLog({
      actionType: "UPDATE_LABELS",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", labels },
    });

    return ok({ labels: allLabels });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_LABELS",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "add", labels },
      errorMessage: error instanceof Error ? error.message : "Unknown label update error",
    });

    return fail(
      "Failed to add labels",
      error instanceof Error ? error.message : "Unknown label update error",
      502,
    );
  }
}

export async function DELETE(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
  try {
    sessionUser = await authenticate(request);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return fail("Unauthorized", error.message, 401);
    }

    return fail(
      "Failed to authenticate request",
      error instanceof Error ? error.message : "Unknown auth error",
      500,
    );
  }

  const { id } = await resolveRouteParams(context);
  const prContext = await getPullRequestGitHubContext(id, sessionUser.id);

  if (!prContext) {
    return fail("Pull request not found", undefined, 404);
  }

  let payload: z.infer<typeof labelsSchema>;
  try {
    payload = await parseBody(request);
  } catch (error) {
    return fail("Invalid request body", error instanceof Error ? error.message : undefined, 400);
  }

  const labels = uniqueLabels(payload.labels);
  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    for (const label of labels) {
      try {
        await octokit.rest.issues.removeLabel({
          owner: prContext.owner,
          repo: prContext.repo,
          issue_number: prContext.number,
          name: label,
        });
      } catch {
        // Ignore missing labels to keep DELETE idempotent.
      }
    }

    const updatedLabels = await octokit.rest.issues.listLabelsOnIssue({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.number,
      per_page: 100,
    });

    const allLabels = updatedLabels.data
      .map((label) => label.name)
      .filter((label): label is string => Boolean(label));

    await prisma.pullRequest.update({
      where: { id },
      data: {
        labels: allLabels,
        githubUpdatedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });

    await writeActionLog({
      actionType: "UPDATE_LABELS",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", labels },
    });

    return ok({ labels: allLabels });
  } catch (error) {
    await writeActionLog({
      actionType: "UPDATE_LABELS",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: { operation: "remove", labels },
      errorMessage: error instanceof Error ? error.message : "Unknown label update error",
    });

    return fail(
      "Failed to remove labels",
      error instanceof Error ? error.message : "Unknown label update error",
      502,
    );
  }
}
