"use client";

import { useState } from "react";
import { Bot, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { LabelSuggestion } from "@/types/pr";
import { requestJson } from "@/lib/request";

interface AiLabelSuggestionsProps {
  pullRequestId: string;
  onApplyLabel: (label: string) => void;
  disabled?: boolean;
}

export function AiLabelSuggestions({
  pullRequestId,
  onApplyLabel,
  disabled = false,
}: AiLabelSuggestionsProps) {
  const [suggestions, setSuggestions] = useState<LabelSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  async function fetchSuggestions() {
    setLoading(true);
    setError(null);
    setDismissed(new Set());
    try {
      const result = await requestJson<{ suggestedLabels: LabelSuggestion[]; cached: boolean }>(
        `/api/prs/${encodeURIComponent(pullRequestId)}/suggest-labels`,
        { method: "POST" },
      );
      setSuggestions(result.suggestedLabels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get suggestions");
    } finally {
      setLoading(false);
    }
  }

  function dismiss(name: string) {
    setDismissed((prev) => new Set(prev).add(name));
  }

  const visible = suggestions.filter((s) => !dismissed.has(s.name));

  return (
    <div className="space-y-1.5">
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
        <div className="flex flex-wrap gap-1">
          {visible.map((s) => (
            <div
              key={s.name}
              className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-border bg-background px-1.5 py-0.5 group"
              title={`${s.reason} (${Math.round(s.confidence * 100)}% confidence)`}
            >
              <Badge variant="secondary" className="text-[10px] px-1 py-0">
                {s.name}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0"
                onClick={() => {
                  onApplyLabel(s.name);
                  dismiss(s.name);
                }}
                disabled={disabled}
                title={`Apply "${s.name}"`}
              >
                <Plus className="h-2.5 w-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => dismiss(s.name)}
                title="Dismiss"
              >
                <X className="h-2.5 w-2.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
