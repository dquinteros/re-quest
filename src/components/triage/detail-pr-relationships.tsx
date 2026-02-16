"use client";

import { useState } from "react";
import { GitBranch, Loader2, Link2, AlertTriangle, ArrowRight, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { requestJson } from "@/lib/request";

interface RelationshipItem {
  prNumberA: number;
  prNumberB: number;
  type: "related" | "depends-on" | "conflicts";
  reason: string;
}

interface DetailPrRelationshipsProps {
  pullRequestId: string;
  currentPrNumber: number;
}

function relationshipBadge(type: string): { label: string; className: string; icon: React.ReactNode } {
  switch (type) {
    case "depends-on":
      return {
        label: "Depends On",
        className: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25",
        icon: <ArrowRight className="h-3 w-3" />,
      };
    case "conflicts":
      return {
        label: "Conflicts",
        className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25",
        icon: <AlertTriangle className="h-3 w-3" />,
      };
    case "related":
    default:
      return {
        label: "Related",
        className: "bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/25",
        icon: <Link2 className="h-3 w-3" />,
      };
  }
}

export function DetailPrRelationships({
  pullRequestId,
  currentPrNumber,
}: DetailPrRelationshipsProps) {
  const [relationships, setRelationships] = useState<RelationshipItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  async function detectRelationships() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<{ relationships: RelationshipItem[]; cached: boolean }>(
        `/api/prs/${encodeURIComponent(pullRequestId)}/relationships`,
        { method: "POST" },
      );
      setRelationships(result.relationships ?? []);
      setFetched(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to detect relationships");
    } finally {
      setLoading(false);
    }
  }

  if (!fetched && !loading) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5" />
            <span>PR Relationships</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => void detectRelationships()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Bot className="h-3 w-3 mr-1" />
            )}
            Detect
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
          <span>Analyzing PR relationships...</span>
        </div>
      </div>
    );
  }

  if (fetched && relationships.length === 0) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitBranch className="h-3.5 w-3.5" />
          <span>No related PRs detected.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <div className="flex items-center gap-2 px-3 py-2">
        <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium">PR Relationships</span>
        <Badge variant="secondary" className="text-[10px]">
          {relationships.length}
        </Badge>
      </div>
      <div className="px-3 pb-3 space-y-1">
        {relationships.map((rel, i) => {
          const otherPr =
            rel.prNumberA === currentPrNumber ? rel.prNumberB : rel.prNumberA;
          const badge = relationshipBadge(rel.type);

          return (
            <div
              key={`${rel.prNumberA}-${rel.prNumberB}-${i}`}
              className="flex items-start gap-2 rounded-md bg-background/50 px-2 py-1.5"
            >
              <div className="shrink-0 mt-0.5">{badge.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-medium">
                    #{otherPr}
                  </span>
                  <Badge variant="outline" className={`text-[9px] ${badge.className}`}>
                    {badge.label}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {rel.reason}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
