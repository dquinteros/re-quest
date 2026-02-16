"use client";

import { ExternalLink, Bot, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TRIAGE_CONTROL_IDS } from "./contracts";

function urgencyLabel(score: number): string {
  if (score >= 60) return "Critical";
  if (score >= 40) return "High";
  if (score >= 20) return "Medium";
  return "Low";
}

function urgencyColor(score: number): string {
  if (score >= 60) return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25";
  if (score >= 40) return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25";
  if (score >= 20) return "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/25";
  return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25";
}

interface DetailHeaderProps {
  repository: string;
  number: number;
  title: string;
  url: string;
  urgencyScore: number;
  aiReviewRunning?: boolean;
  onRunAiReview?: () => void;
}

export function DetailHeader({
  repository,
  number,
  title,
  url,
  urgencyScore,
  aiReviewRunning = false,
  onRunAiReview,
}: DetailHeaderProps) {
  return (
    <header className="flex items-start justify-between gap-4 pb-4 border-b border-border">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">
            {repository} #{number}
          </span>
          <Badge className={urgencyColor(urgencyScore)} variant="outline">
            {urgencyLabel(urgencyScore)} &middot; {Math.round(urgencyScore)}
          </Badge>
        </div>
        <h2 className="text-lg font-semibold leading-tight text-foreground truncate">
          {title}
        </h2>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {onRunAiReview && (
          <Button
            id={TRIAGE_CONTROL_IDS.aiReviewRun}
            data-control-id={TRIAGE_CONTROL_IDS.aiReviewRun}
            variant="outline"
            size="sm"
            className="h-auto py-1.5 px-3 text-xs font-medium"
            disabled={aiReviewRunning}
            onClick={onRunAiReview}
          >
            {aiReviewRunning ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Bot className="h-3.5 w-3.5 mr-1.5" />
            )}
            {aiReviewRunning ? "AI Review Running…" : "AI Review"}
          </Button>
        )}
        <a
          id={TRIAGE_CONTROL_IDS.openOnGithub}
          data-control-id={TRIAGE_CONTROL_IDS.openOnGithub}
          data-shortcut-target={TRIAGE_CONTROL_IDS.openOnGithub}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          GitHub
        </a>
      </div>
    </header>
  );
}
