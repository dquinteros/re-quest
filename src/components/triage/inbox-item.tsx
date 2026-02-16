"use client";

import { cn } from "@/lib/utils";
import type { PullRequestListItem } from "@/types/pr";
import { inboxItemControlId } from "./contracts";

function urgencyDot(score: number): string {
  if (score >= 60) return "bg-red-500";
  if (score >= 40) return "bg-orange-500";
  if (score >= 20) return "bg-yellow-500";
  return "bg-emerald-500";
}

interface InboxItemProps {
  item: PullRequestListItem;
  isActive: boolean;
  onSelect: (id: string) => void;
}

export function InboxItem({ item, isActive, onSelect }: InboxItemProps) {
  const controlId = inboxItemControlId(item.id);

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
