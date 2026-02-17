"use client";

import { useState } from "react";
import { Shield, ChevronDown, ChevronRight, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RiskAssessment } from "@/types/pr";
import { requestJson } from "@/lib/request";

interface DetailRiskAssessmentProps {
  pullRequestId: string;
  initialAssessment?: RiskAssessment | null;
}

function riskLevelBadge(level: string): { label: string; className: string } {
  switch (level) {
    case "critical":
      return { label: "Critical Risk", className: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/25" };
    case "high":
      return { label: "High Risk", className: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/25" };
    case "medium":
      return { label: "Medium Risk", className: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/25" };
    case "low":
      return { label: "Low Risk", className: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25" };
    default:
      return { label: level, className: "bg-muted text-muted-foreground border-border" };
  }
}

function categoryIcon(category: string): string {
  switch (category) {
    case "security": return "🔒";
    case "data": return "🗄️";
    case "api": return "🔌";
    case "infrastructure": return "⚙️";
    case "quality": return "✅";
    default: return "📋";
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case "high": return "text-red-600 dark:text-red-400";
    case "medium": return "text-yellow-600 dark:text-yellow-400";
    case "low": return "text-emerald-600 dark:text-emerald-400";
    default: return "text-muted-foreground";
  }
}

export function DetailRiskAssessment({ pullRequestId, initialAssessment }: DetailRiskAssessmentProps) {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(initialAssessment ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  async function generateAssessment() {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<RiskAssessment & { cached: boolean }>(
        `/api/prs/${encodeURIComponent(pullRequestId)}/ai-risk`,
        { method: "POST" },
      );
      setAssessment(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate risk assessment");
    } finally {
      setLoading(false);
    }
  }

  if (!assessment && !loading) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5" />
            <span>Risk Assessment</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-[11px]"
            onClick={() => void generateAssessment()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <Shield className="h-3 w-3 mr-1" />
            )}
            Assess Risk
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
          <span>Analyzing risks...</span>
        </div>
      </div>
    );
  }

  if (!assessment) return null;

  const badge = riskLevelBadge(assessment.riskLevel ?? "low");
  const riskFactors = Array.isArray(assessment.riskFactors) ? assessment.riskFactors : [];

  return (
    <div className="rounded-md border border-border bg-muted/20">
      <button
        type="button"
        className="flex items-center justify-between w-full px-3 py-2 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          )}
          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Risk Assessment</span>
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
            void generateAssessment();
          }}
          title="Regenerate assessment"
        >
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-foreground leading-relaxed">
            {assessment.explanation ?? "No explanation available."}
          </p>

          {riskFactors.length > 0 && (
            <div className="space-y-1">
              {riskFactors.map((factor, i) => (
                <div
                  key={`${factor.category}-${i}`}
                  className="flex items-start gap-1.5 text-[11px] rounded-md bg-background/50 px-2 py-1.5"
                >
                  <span className="shrink-0">{categoryIcon(factor.category)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium capitalize">{factor.category}</span>
                      <span className={`text-[10px] font-medium ${severityColor(factor.severity)}`}>
                        {factor.severity}
                      </span>
                    </div>
                    <p className="text-muted-foreground mt-0.5">{factor.description}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {riskFactors.length === 0 && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <AlertTriangle className="h-3 w-3" />
              <span>No specific risk factors identified.</span>
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
