import { z } from "zod";
import { writeActionLog } from "@/lib/action-log";
import { getViewerLogin } from "@/lib/github";
import { fail, ok } from "@/lib/http";
import {
  AuthenticationError,
  createOAuthUserOctokit,
  getPullRequestGitHubContext,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const commentSchema = z
  .object({
    body: z.string().trim().min(1),
  })
  .strict();

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

  let parsedBody: z.infer<typeof commentSchema>;
  try {
    parsedBody = commentSchema.parse(await request.json());
  } catch (error) {
    return fail(
      "Invalid request body",
      error instanceof Error ? error.message : "Unknown body parsing error",
      400,
    );
  }

  const octokit = createOAuthUserOctokit(sessionUser.githubToken);
  const viewerLogin = (await getViewerLogin(octokit)) ?? sessionUser.login;

  try {
    const comment = await octokit.rest.issues.createComment({
      owner: prContext.owner,
      repo: prContext.repo,
      issue_number: prContext.number,
      body: parsedBody.body,
    });

    await writeActionLog({
      actionType: "COMMENT",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
    });

    return ok({
      comment: {
        id: comment.data.id,
        url: comment.data.html_url,
        body: comment.data.body,
        author: comment.data.user?.login ?? null,
        createdAt: comment.data.created_at,
      },
    }, 201);
  } catch (error) {
    await writeActionLog({
      actionType: "COMMENT",
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
      errorMessage: error instanceof Error ? error.message : "Unknown comment error",
    });

    return fail(
      "Failed to create comment",
      error instanceof Error ? error.message : "Unknown comment error",
      502,
    );
  }
}
