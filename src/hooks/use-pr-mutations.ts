import { useCallback, useState, type FormEvent } from "react";
import type { MutateTarget, PendingReviewMode, ReviewEvent } from "@/components/triage/contracts";
import type { PullRequestDetail } from "@/types/pr";
import { requestJson } from "@/lib/request";

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export interface MutationFormState {
  commentBody: string;
  reviewBody: string;
  reviewEvent: ReviewEvent;
  pendingReviewMode: PendingReviewMode;
  pendingReviewId: string;
  labelName: string;
  assigneeLogin: string;
  reviewerLogin: string;
  propTitle: string;
  propBody: string;
  propState: "open" | "closed";
  milestoneNumber: string;
  projectIdsCsv: string;
}

export interface UsePrMutationsResult {
  writing: boolean;
  form: MutationFormState;
  setFormField: <K extends keyof MutationFormState>(key: K, value: MutationFormState[K]) => void;
  resetFormForDetail: (detail: PullRequestDetail) => void;
  submitComment: (event: FormEvent<HTMLFormElement>) => void;
  submitQuickReview: (event: FormEvent<HTMLFormElement>) => void;
  submitPendingReview: (event: FormEvent<HTMLFormElement>) => void;
  submitProperties: (event: FormEvent<HTMLFormElement>) => void;
  mutateStringItem: (target: MutateTarget, value: string, method: "POST" | "DELETE") => void;
}

const INITIAL_FORM: MutationFormState = {
  commentBody: "",
  reviewBody: "",
  reviewEvent: "COMMENT",
  pendingReviewMode: "pending_create",
  pendingReviewId: "",
  labelName: "",
  assigneeLogin: "",
  reviewerLogin: "",
  propTitle: "",
  propBody: "",
  propState: "open",
  milestoneNumber: "",
  projectIdsCsv: "",
};

export function usePrMutations(
  selectedId: string | null,
  detail: PullRequestDetail | null,
  triggerRefresh: () => void,
  addToast: (message: string, type: "info" | "error") => void,
): UsePrMutationsResult {
  const [writing, setWriting] = useState(false);
  const [form, setForm] = useState<MutationFormState>(INITIAL_FORM);

  const setFormField = useCallback(
    <K extends keyof MutationFormState>(key: K, value: MutationFormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFormForDetail = useCallback((d: PullRequestDetail) => {
    setForm((prev) => ({
      ...prev,
      propTitle: d.title,
      propBody: d.body ?? "",
      propState: d.state === "CLOSED" ? "closed" : "open",
      milestoneNumber: "",
      projectIdsCsv: d.projects.join(","),
    }));
  }, []);

  async function runMutation(label: string, action: () => Promise<void>) {
    setWriting(true);
    try {
      await action();
      addToast(`${label} completed.`, "info");
      triggerRefresh();
    } catch (error) {
      addToast(error instanceof Error ? error.message : `${label} failed`, "error");
    } finally {
      setWriting(false);
    }
  }

  const submitComment = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId || !form.commentBody.trim()) return;
      const body = form.commentBody.trim();
      void runMutation("Comment", async () => {
        await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body }),
        });
      });
      setForm((prev) => ({ ...prev, commentBody: "" }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, form.commentBody],
  );

  const submitQuickReview = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId) return;
      const trimmedBody = form.reviewBody.trim();
      void runMutation("Review", async () => {
        await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/reviews`, {
          method: "POST",
          body: JSON.stringify({
            mode: "quick",
            event: form.reviewEvent,
            body: trimmedBody || undefined,
          }),
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, form.reviewBody, form.reviewEvent],
  );

  const submitPendingReview = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId) return;

      const trimmedBody = form.reviewBody.trim();
      const { pendingReviewMode, pendingReviewId, reviewEvent } = form;

      if (
        (pendingReviewMode === "pending_submit" || pendingReviewMode === "pending_delete") &&
        (!pendingReviewId.trim() || Number.isNaN(Number(pendingReviewId)))
      ) {
        addToast("Pending review actions require a numeric review ID.", "error");
        return;
      }

      const payload =
        pendingReviewMode === "pending_create"
          ? { mode: "pending", action: "create", body: trimmedBody || undefined }
          : pendingReviewMode === "pending_submit"
            ? {
                mode: "pending",
                action: "submit",
                reviewId: Number(pendingReviewId),
                event: reviewEvent,
                body: trimmedBody || undefined,
              }
            : { mode: "pending", action: "delete", reviewId: Number(pendingReviewId) };

      void runMutation("Review", async () => {
        await requestJson(`/api/prs/${encodeURIComponent(selectedId)}/reviews`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, form.reviewBody, form.pendingReviewMode, form.pendingReviewId, form.reviewEvent],
  );

  const submitProperties = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!selectedId || !detail) return;

      const milestoneRaw = form.milestoneNumber.trim();
      const projectIds = csvToList(form.projectIdsCsv);

      const payload: Record<string, unknown> = {
        title: form.propTitle.trim() || detail.title,
        body: form.propBody,
        state: form.propState,
      };

      if (milestoneRaw) {
        const parsedMilestone = Number(milestoneRaw);
        if (Number.isNaN(parsedMilestone)) {
          addToast("Milestone must be a number.", "error");
          return;
        }
        payload.milestoneNumber = parsedMilestone;
      }

      if (projectIds.length) payload.projectIds = projectIds;

      void runMutation("Properties update", async () => {
        await requestJson(`/api/prs/${encodeURIComponent(selectedId)}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId, detail, form.propTitle, form.propBody, form.propState, form.milestoneNumber, form.projectIdsCsv],
  );

  const mutateStringItem = useCallback(
    (target: MutateTarget, value: string, method: "POST" | "DELETE") => {
      if (!selectedId || !value.trim()) return;

      const encodedId = encodeURIComponent(selectedId);
      const trimmed = value.trim();
      const payload =
        target === "labels"
          ? { labels: [trimmed] }
          : target === "assignees"
            ? { assignees: [trimmed] }
            : { reviewers: [trimmed] };

      void runMutation(`${method === "POST" ? "Added" : "Removed"} ${target.slice(0, -1)}`, async () => {
        await requestJson(`/api/prs/${encodedId}/${target}`, {
          method,
          body: JSON.stringify(payload),
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedId],
  );

  return {
    writing,
    form,
    setFormField,
    resetFormForDetail,
    submitComment,
    submitQuickReview,
    submitPendingReview,
    submitProperties,
    mutateStringItem,
  };
}
