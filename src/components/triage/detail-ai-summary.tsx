"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, Loader2, RefreshCw, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AiSummary } from "@/types/pr";
import { requestJson } from "@/lib/request";

interface DetailAiSummaryProps {
  pullRequestId: string;
  initialSummary?: AiSummary | null;
}

function changeTypeBadge(type: string): { label: string; className: string } {
  switch (type) {
    case "feature":
      return { label: "Feature", className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25" };
    case "bugfix":
      return { label: "Bug Fix", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25" };
    case "refactor":
      return { label: "Refactor", className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25" };
    case "docs":
      return { label: "Docs", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" };
    case "chore":
      return { label: "Chore", className: "bg-muted text-muted-foreground border-border" };
    default:
      return { label: type, className: "bg-muted text-muted-foreground border-border" };
  }
}

export function DetailAiSummary({ pullRequestId, initialSummary }: DetailAiSummaryProps) {
  const [summary, setSummary] = useState<AiSummary | null>(initialSummary ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function generateSummary() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<AiSummary & { cached: boolean }>(
        `/api/prs/${encodeURIComponent(pullRequestId)}/ai-summary`,
        { method: "POST" },
      );
      setSummary(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  }

  if (!summary && !loading) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="h-3.5 w-3.5" />
            <span>AI Summary</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => void generateSummary()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Bot className="h-3 w-3 mr-1" />
            )}
            Generate Summary
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-[11px] text-destructive">{error}</p>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Generating AI summary...</span>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const badge = changeTypeBadge(summary.changeType ?? "other");
  const keyChanges = Array.isArray(summary.keyChanges) ? summary.keyChanges : [];

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div
        role="button"
        tabIndex={0}
        className="flex items-center justify-between w-full px-3 py-2 text-left cursor-pointer"
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">AI Summary</span>
          <Badge variant="outline" className={`text-[10px] ${badge.className}`}>
            {badge.label}
          </Badge>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            void generateSummary();
          }}
          title="Regenerate summary"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-foreground leading-relaxed">
            {summary.summary ?? "No summary available."}
          </p>

          {keyChanges.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
                Key Changes
              </p>
              <div className="space-y-0.5">
                {keyChanges.slice(0, 8).map((change) => (
                  <div
                    key={change.file}
                    className="flex items-start gap-1.5 text-[11px]"
                  >
                    <FileCode className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                    <span className="font-mono text-muted-foreground truncate max-w-[180px]" title={change.file}>
                      {change.file}
                    </span>
                    <span className="text-foreground">{change.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-[11px] text-destructive">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
