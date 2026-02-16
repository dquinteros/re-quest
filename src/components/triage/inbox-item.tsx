"use client";

import { AlertTriangle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PullRequestListItem } from "@/types/pr";
import { inboxItemControlId } from "./contracts";

function urgencyDot(score: number): string {
  if (score >= 60) return "bg-red-500";
  if (score >= 40) return "bg-orange-500";
  if (score >= 20) return "bg-yellow-500";
  return "bg-emerald-500";
}

function flowPhaseBadge(phase: string | null): { label: string; className: string } | null {
  switch (phase) {
    case "Development":
      return { label: "Dev", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25" };
    case "QA Fix":
      return { label: "QA", className: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25" };
    case "Promotion":
      return { label: "Promo", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" };
    default:
      return null;
  }
}

interface InboxItemProps {
  item: PullRequestListItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function InboxItem({ item, isActive, onSelect }: InboxItemProps) {
  const controlId = inboxItemControlId(item.id);
  const phase = flowPhaseBadge(item.flowPhase);

  return (
    <button
      id={controlId}
      data-control-id={controlId}
      data-shortcut-target={controlId}
      type="button"
      className={cn(
        "w-full text-left px-3 py-2.5 transition-colors duration-100 border-l-2 group",
        isActive
          ? "bg-accent border-l-primary"
          : "border-l-transparent hover:bg-muted/50",
      )}
      aria-pressed={isActive}
      onClick={() => onSelect(item.id)}
    >
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[11px] text-muted-foreground truncate">
          {item.repository}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {item.riskLevel && item.riskLevel !== "low" && (
            <span
              className={cn(
                item.riskLevel === "critical" ? "text-red-500" :
                item.riskLevel === "high" ? "text-orange-500" :
                "text-yellow-500"
              )}
              title={`${item.riskLevel} risk`}
            >
              <Shield className="h-3 w-3" />
            </span>
          )}
          {item.flowViolation && (
            <span
              className="text-red-500"
              title={item.flowViolation.message}
            >
              <AlertTriangle className="h-3 w-3" />
            </span>
          )}
          {phase && (
            <span
              className={cn(
                "inline-flex items-center rounded px-1 py-0.5 text-[9px] font-medium border leading-none",
                phase.className,
              )}
            >
              {phase.label}
            </span>
          )}
          <span className={cn("h-2 w-2 rounded-full shrink-0", urgencyDot(item.urgencyScore))} />
          <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
            {Math.round(item.urgencyScore)}
          </span>
        </div>
      </div>
      <p className="text-sm font-medium leading-snug truncate text-foreground">
        #{item.number} {item.title}
      </p>
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground">
        {item.hasConflicts === true && (
          <span className="text-destructive font-medium">Conflicts</span>
        )}
        <span>{item.reviewState.replace(/_/g, " ").toLowerCase()}</span>
        <span className="text-muted-foreground/50">·</span>
        <span>CI {item.ciState.toLowerCase()}</span>
        {item.headRef && item.baseRef && (
          <>
            <span className="text-muted-foreground/50">·</span>
            <span className="truncate max-w-[120px]" title={`${item.headRef} → ${item.baseRef}`}>
              {item.headRef.split("/").slice(1).join("/") || item.headRef} → {item.baseRef}
            </span>
          </>
        )}
        <span className="text-muted-foreground/50">·</span>
        <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
      </div>
      {item.attentionReason && (
        <p className="text-[10px] text-primary/80 mt-0.5 truncate">
          {item.attentionReason}
        </p>
      )}
    </button>
  );
}
