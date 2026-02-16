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
  refreshAttentionForStoredPullRequest,
  requireAuthenticatedSessionUser,
} from "@/lib/pr-mutations";
import { resolveRouteParams, type DynamicRouteContext } from "@/lib/route-params";

const reviewSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("quick"),
      event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]),
      body: z.string().optional(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("pending"),
      action: z.enum(["create", "submit", "delete"]),
      reviewId: z.coerce.number().int().positive().optional(),
      event: z.enum(["APPROVE", "REQUEST_CHANGES", "COMMENT"]).optional(),
      body: z.string().optional(),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (value.action === "submit" || value.action === "delete") {
        if (!value.reviewId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "reviewId is required when action is submit or delete",
          });
        }
      }

      if (value.action === "submit" && !value.event) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "event is required when action is submit",
        });
      }
    }),
]);

function reviewEventToState(
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT",
): "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" {
  if (event === "APPROVE") {
    return "APPROVED";
  }

  if (event === "REQUEST_CHANGES") {
    return "CHANGES_REQUESTED";
  }

  return "COMMENTED";
}

export async function POST(
  request: Request,
  context: DynamicRouteContext<{ id: string }>,
) {
  let sessionUser: AuthenticatedSessionUser;
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

  let parsedBody: z.infer<typeof reviewSchema>;
  try {
    parsedBody = reviewSchema.parse(await request.json());
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
    if (parsedBody.mode === "quick") {
      const response = await octokit.rest.pulls.createReview({
        owner: prContext.owner,
        repo: prContext.repo,
        pull_number: prContext.number,
        event: parsedBody.event,
        ...(parsedBody.body ? { body: parsedBody.body } : {}),
      });

      await prisma.pullRequest.update({
        where: { id },
        data: {
          reviewState: reviewEventToState(parsedBody.event),
          githubUpdatedAt: response.data.submitted_at
            ? new Date(response.data.submitted_at)
            : new Date(),
          lastActivityAt: response.data.submitted_at
            ? new Date(response.data.submitted_at)
            : new Date(),
        },
      });

      await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

      await writeActionLog({
        actionType: "REVIEW_QUICK",
        resultStatus: "SUCCESS",
        repository: prContext.fullName,
        pullNumber: prContext.number,
        actorLogin: viewerLogin,
        payload: parsedBody,
      });

      return ok({
        mode: "quick",
        review: {
          id: response.data.id,
          state: response.data.state,
          submittedAt: response.data.submitted_at,
          body: response.data.body,
          url: response.data.html_url,
        },
      }, 201);
    }

    if (parsedBody.action === "create") {
      const response = await octokit.rest.pulls.createReview({
        owner: prContext.owner,
        repo: prContext.repo,
        pull_number: prContext.number,
        ...(parsedBody.body ? { body: parsedBody.body } : {}),
      });

      await writeActionLog({
        actionType: "REVIEW_PENDING_CREATE",
        resultStatus: "SUCCESS",
        repository: prContext.fullName,
        pullNumber: prContext.number,
        actorLogin: viewerLogin,
        payload: parsedBody,
      });

      return ok({
        mode: "pending",
        action: "create",
        review: {
          id: response.data.id,
          state: response.data.state,
          body: response.data.body,
          submittedAt: response.data.submitted_at,
          url: response.data.html_url,
        },
      }, 201);
    }

    if (parsedBody.action === "submit") {
      if (!parsedBody.reviewId || !parsedBody.event) {
        return fail("Invalid request body", "reviewId and event are required", 400);
      }

      const response = await octokit.rest.pulls.submitReview({
        owner: prContext.owner,
        repo: prContext.repo,
        pull_number: prContext.number,
        review_id: parsedBody.reviewId,
        event: parsedBody.event,
        ...(parsedBody.body ? { body: parsedBody.body } : {}),
      });

      await prisma.pullRequest.update({
        where: { id },
        data: {
          reviewState: reviewEventToState(parsedBody.event),
          githubUpdatedAt: response.data.submitted_at
            ? new Date(response.data.submitted_at)
            : new Date(),
          lastActivityAt: response.data.submitted_at
            ? new Date(response.data.submitted_at)
            : new Date(),
        },
      });

      await refreshAttentionForStoredPullRequest(id, viewerLogin, sessionUser.id);

      await writeActionLog({
        actionType: "REVIEW_PENDING_SUBMIT",
        resultStatus: "SUCCESS",
        repository: prContext.fullName,
        pullNumber: prContext.number,
        actorLogin: viewerLogin,
        payload: parsedBody,
      });

      return ok({
        mode: "pending",
        action: "submit",
        review: {
          id: response.data.id,
          state: response.data.state,
          submittedAt: response.data.submitted_at,
          body: response.data.body,
          url: response.data.html_url,
        },
      });
    }

    if (!parsedBody.reviewId) {
      return fail("Invalid request body", "reviewId is required", 400);
    }

    await octokit.rest.pulls.deletePendingReview({
      owner: prContext.owner,
      repo: prContext.repo,
      pull_number: prContext.number,
      review_id: parsedBody.reviewId,
    });

    await writeActionLog({
      actionType: "REVIEW_PENDING_DELETE",
      resultStatus: "SUCCESS",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
    });

    return ok({
      mode: "pending",
      action: "delete",
      reviewId: parsedBody.reviewId,
      deleted: true,
    });
  } catch (error) {
    const actionType =
      parsedBody.mode === "quick"
        ? "REVIEW_QUICK"
        : parsedBody.action === "create"
          ? "REVIEW_PENDING_CREATE"
          : parsedBody.action === "submit"
            ? "REVIEW_PENDING_SUBMIT"
            : "REVIEW_PENDING_DELETE";

    await writeActionLog({
      actionType,
      resultStatus: "FAILED",
      repository: prContext.fullName,
      pullNumber: prContext.number,
      actorLogin: viewerLogin,
      payload: parsedBody,
      errorMessage: error instanceof Error ? error.message : "Unknown review error",
    });

    return fail(
      "Failed to process review",
      error instanceof Error ? error.message : "Unknown review error",
      502,
    );
  }
}
