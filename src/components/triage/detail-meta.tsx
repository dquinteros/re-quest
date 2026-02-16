"use client";

import { AlertTriangle, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { PullRequestDetail } from "@/types/pr";

function ciVariant(state: string) {
  switch (state) {
    case "SUCCESS": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    case "FAILURE": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25";
    case "PENDING": return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/25";
    default: return "bg-muted text-muted-foreground";
  }
}

function reviewVariant(state: string) {
  switch (state) {
    case "APPROVED": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    case "CHANGES_REQUESTED": return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25";
    case "REVIEW_REQUESTED": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25";
    default: return "bg-muted text-muted-foreground";
  }
}

function stateVariant(state: string) {
  switch (state) {
    case "OPEN": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    case "MERGED": return "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25";
    case "CLOSED": return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25";
    default: return "bg-muted text-muted-foreground";
  }
}

function flowPhaseVariant(phase: string | null) {
  switch (phase) {
    case "Development": return "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25";
    case "QA Fix": return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25";
    case "Promotion": return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
    default: return "bg-muted text-muted-foreground";
  }
}

interface DetailMetaProps {
  detail: PullRequestDetail;
}

export function DetailMeta({ detail }: DetailMetaProps) {
  return (
    <div className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={stateVariant(detail.state)}>
          {detail.state}
        </Badge>
        <Badge variant="outline" className={reviewVariant(detail.reviewState)}>
          {detail.reviewState.replace(/_/g, " ")}
        </Badge>
        <Badge variant="outline" className={ciVariant(detail.ciState)}>
          CI: {detail.ciState}
        </Badge>
        {detail.draft && (
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Draft
          </Badge>
        )}
        {detail.flowPhase && (
          <Badge variant="outline" className={flowPhaseVariant(detail.flowPhase)}>
            {detail.flowPhase}
          </Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">
          by <span className="font-medium text-foreground">{detail.authorLogin}</span>
          {" · "}
          {new Date(detail.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {detail.headRef && detail.baseRef && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5 shrink-0" />
          <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{detail.headRef}</code>
          <span className="text-muted-foreground/60">&rarr;</span>
          <code className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">{detail.baseRef}</code>
        </div>
      )}

      {detail.flowViolation && (
        <div className="flex items-start gap-2 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-xs text-red-600 dark:text-red-400">
            <p className="font-medium">Flow violation</p>
            <p className="mt-0.5">{detail.flowViolation.message}</p>
          </div>
        </div>
      )}
    </div>
  );
}
