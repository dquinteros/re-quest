"use client";

import { useState } from "react";
import { Bot, Loader2, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReviewerSuggestion } from "@/types/pr";
import { requestJson } from "@/lib/request";

interface AiReviewerSuggestionsProps {
  pullRequestId: string;
  onApplyReviewer: (login: string) => void;
  disabled?: boolean;
}

export function AiReviewerSuggestions({
  pullRequestId,
  onApplyReviewer,
  disabled = false,
}: AiReviewerSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<ReviewerSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setDismissed(new Set());
    try {
      const result = await requestJson<{ suggestedReviewers: ReviewerSuggestion[]; cached: boolean }>(
        `/api/prs/${encodeURIComponent(pullRequestId)}/suggest-reviewers`,
        { method: "POST" },
      );
      setSuggestions(result.suggestedReviewers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  function dismiss(login: string) {
    setDismissed((prev) => new Set(prev).add(login));
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.login));

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">AI Suggestions</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px]"
          onClick={() => void fetchSuggestions()}
          disabled={loading || disabled}
        >
          {loading ? (
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Bot className="h-3 w-3 mr-1" />
          )}
          Suggest
        </Button>
      </div>

      {error && (
        <p className="text-[10px] text-destructive">{error}</p>
      )}

      {visible.length > 0 && (
        <div className="space-y-1">
          {visible.map((s) => (
            <div
              key={s.login}
              className="flex items-center justify-between rounded-md border border-dashed border-border bg-background px-2 py-1.5 group"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium">@{s.login}</span>
                  <span className="text-[9px] text-muted-foreground tabular-nums">
                    {s.score}/100
                  </span>
                </div>
                {s.reasons.length > 0 && (
                  <p className="text-[10px] text-muted-foreground truncate" title={s.reasons.join("; ")}>
                    {s.reasons[0]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={() => {
                    onApplyReviewer(s.login);
                    dismiss(s.login);
                  }}
                  disabled={disabled}
                  title={`Request review from @${s.login}`}
                >
                  <UserPlus className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => dismiss(s.login)}
                  title="Dismiss"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
