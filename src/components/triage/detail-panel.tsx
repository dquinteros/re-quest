"use client";

import type { FormEvent } from "react";
import { Inbox } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PullRequestDetail, PullRequestListItem } from "@/types/pr";
import type { MutationFormState } from "@/hooks/use-pr-mutations";
import type { MutateTarget } from "./contracts";
import { TRIAGE_CONTROL_IDS } from "./contracts";
import { DetailHeader } from "./detail-header";
import { DetailMeta } from "./detail-meta";
import { DetailDescription } from "./detail-description";
import { DetailActions } from "./detail-actions";

interface DetailPanelProps {
  selectedId: string | null;
  selectedListItem: PullRequestListItem | null;
  detail: PullRequestDetail | null;
  detailLoading: boolean;
  detailError: string | null;
  writing: boolean;
  form: MutationFormState;
  setFormField: <K extends keyof MutationFormState>(key: K, value: MutationFormState[K]) => void;
  onSubmitComment: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitQuickReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitPendingReview: (event: FormEvent<HTMLFormElement>) => void;
  onSubmitProperties: (event: FormEvent<HTMLFormElement>) => void;
  onMutateStringItem: (target: MutateTarget, value: string, method: "POST" | "DELETE") => void;
  aiReviewRunning?: boolean;
  onRunAiReview?: () => void;
  refreshing?: boolean;
  onRefreshPr?: () => void;
}

function DetailSkeleton() {
  return (
    <div className="space-y-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-3/4" />
        </div>
        <Skeleton className="h-9 w-24 rounded-md" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
      <Skeleton className="h-32 w-full rounded-md" />
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-3 w-full" />
        ))}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, description }: { icon: React.ReactNode; title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8 gap-3">
      <div className="text-muted-foreground/50">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground max-w-[240px]">{description}</p>
    </div>
  );
}

export function DetailPanel({
  selectedId,
  selectedListItem,
  detail,
  detailLoading,
  detailError,
  writing,
  form,
  setFormField,
  onSubmitComment,
  onSubmitQuickReview,
  onSubmitPendingReview,
  onSubmitProperties,
  onMutateStringItem,
  aiReviewRunning = false,
  onRunAiReview,
  refreshing = false,
  onRefreshPr,
}: DetailPanelProps) {
  if (!selectedId) {
    return (
      <article
        id={TRIAGE_CONTROL_IDS.detailPanel}
        className="flex-1 flex items-center justify-center min-h-0"
        tabIndex={-1}
      >
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="Select a pull request"
          description="Choose a PR from the inbox to view its details and take action."
        />
      </article>
    );
  }

  if (detailLoading) {
    return (
      <article
        id={TRIAGE_CONTROL_IDS.detailPanel}
        className="flex-1 min-h-0"
        tabIndex={-1}
      >
        <DetailSkeleton />
      </article>
    );
  }

  if (!detail) {
    return (
      <article
        id={TRIAGE_CONTROL_IDS.detailPanel}
        className="flex-1 flex items-center justify-center min-h-0"
        tabIndex={-1}
      >
        <EmptyState
          icon={<Inbox className="h-10 w-10" />}
          title="No details available"
          description={
            detailError
              ? detailError
              : selectedListItem
                ? `Could not load details for ${selectedListItem.repository} #${selectedListItem.number}.`
                : "Could not load details."
          }
        />
      </article>
    );
  }

  return (
    <article
      id={TRIAGE_CONTROL_IDS.detailPanel}
      data-control-id={TRIAGE_CONTROL_IDS.detailPanel}
      className="h-full flex flex-col min-h-0"
      tabIndex={-1}
    >
      <ScrollArea className="flex-1">
        <div className="p-5 space-y-4">
          <DetailHeader
            repository={detail.repository}
            number={detail.number}
            title={detail.title}
            url={detail.url}
            urgencyScore={detail.urgencyScore}
            aiReviewRunning={aiReviewRunning}
            onRunAiReview={onRunAiReview}
            refreshing={refreshing}
            onRefreshPr={onRefreshPr}
          />
          <DetailMeta detail={detail} />
          <DetailDescription detail={detail} />
          <DetailActions
            pullRequestId={detail.id}
            writing={writing}
            form={form}
            setFormField={setFormField}
            onSubmitComment={onSubmitComment}
            onSubmitQuickReview={onSubmitQuickReview}
            onSubmitPendingReview={onSubmitPendingReview}
            onSubmitProperties={onSubmitProperties}
            onMutateStringItem={onMutateStringItem}
          />
        </div>
      </ScrollArea>
    </article>
  );
}
