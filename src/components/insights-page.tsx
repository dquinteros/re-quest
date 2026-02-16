"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Bot, Loader2, RefreshCw, BarChart3, AlertTriangle, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AppNav } from "@/components/app-nav";
import { useTheme, type Theme } from "@/hooks/use-theme";
import { requestJson } from "@/lib/request";

interface DigestResponse {
  markdown: string | null;
  metrics: {
    totalOpenPrs: number;
    totalTrackedRepos: number;
    needsAttentionCount: number;
    avgUrgencyScore: number;
    failingCiCount: number;
    conflictCount: number;
    prsByReviewState: Record<string, number>;
    reviewerWorkload: Array<{ login: string; count: number }>;
    stalePrs: Array<{ repository: string; number: number; title: string; daysSinceUpdate: number }>;
  };
  cached: boolean;
}

function MetricCard({
  icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  variant?: "default" | "warning" | "danger";
}) {
  const colors = {
    default: "border-border",
    warning: "border-yellow-500/25 bg-yellow-500/5",
    danger: "border-red-500/25 bg-red-500/5",
  };

  return (
    <div className={`rounded-lg border p-4 ${colors[variant]}`}>
      <div className="flex items-center gap-2 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

interface InsightsPageProps {
  viewerLabel?: string | null;
}

export function InsightsPage({ viewerLabel }: InsightsPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [data, setData] = useState<DigestResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDigest = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await requestJson<DigestResponse>("/api/insights/digest");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load insights");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDigest();
  }, [fetchDigest]);

  async function generateDigest() {
    setGenerating(true);
    setError(null);
    try {
      const result = await requestJson<DigestResponse>("/api/insights/digest", {
        method: "POST",
      });
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate digest");
    } finally {
      setGenerating(false);
    }
  }

  const metrics = data?.metrics;

  return (
    <>
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        signingOut={false}
        authenticated
        onToggleTheme={toggleTheme}
      />
      <main className="min-h-[calc(100vh-3rem)] bg-background">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Team Insights</h1>
              <p className="text-sm text-muted-foreground mt-1">
                AI-powered analysis of your PR activity and team health.
              </p>
            </div>
            <Button
              onClick={() => void generateDigest()}
              disabled={generating}
              className="gap-2"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bot className="h-4 w-4" />
              )}
              {generating ? "Generating..." : "Generate Digest"}
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {metrics && (
            <>
              {/* Metric cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                  icon={<BarChart3 className="h-4 w-4" />}
                  label="Open PRs"
                  value={metrics.totalOpenPrs}
                />
                <MetricCard
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="Needs Attention"
                  value={metrics.needsAttentionCount}
                  variant={metrics.needsAttentionCount > 5 ? "warning" : "default"}
                />
                <MetricCard
                  icon={<AlertTriangle className="h-4 w-4" />}
                  label="Failing CI"
                  value={metrics.failingCiCount}
                  variant={metrics.failingCiCount > 0 ? "danger" : "default"}
                />
                <MetricCard
                  icon={<Clock className="h-4 w-4" />}
                  label="Avg Urgency"
                  value={metrics.avgUrgencyScore}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Reviewer workload */}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Reviewer Workload</h3>
                  </div>
                  {metrics.reviewerWorkload.length > 0 ? (
                    <div className="space-y-2">
                      {metrics.reviewerWorkload.slice(0, 8).map((r) => (
                        <div key={r.login} className="flex items-center justify-between">
                          <span className="text-xs">@{r.login}</span>
                          <div className="flex items-center gap-2">
                            <div
                              className="h-2 rounded-full bg-blue-500"
                              style={{ width: `${Math.min(100, r.count * 20)}px` }}
                            />
                            <span className="text-xs tabular-nums text-muted-foreground w-4 text-right">
                              {r.count}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No reviewer data available.</p>
                  )}
                </div>

                {/* Stale PRs */}
                <div className="rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-medium">Stale PRs</h3>
                    <Badge variant="secondary" className="text-[10px]">
                      {metrics.stalePrs.length}
                    </Badge>
                  </div>
                  {metrics.stalePrs.length > 0 ? (
                    <div className="space-y-1.5">
                      {metrics.stalePrs.slice(0, 5).map((pr) => (
                        <div key={`${pr.repository}-${pr.number}`} className="text-xs">
                          <span className="text-muted-foreground">{pr.repository} #{pr.number}</span>
                          <span className="ml-1 truncate">{pr.title}</span>
                          <Badge variant="outline" className="ml-1 text-[9px]">
                            {pr.daysSinceUpdate}d
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No stale PRs. Great job!</p>
                  )}
                </div>
              </div>

              {/* AI Digest */}
              <div className="rounded-lg border border-border p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                  <h3 className="text-lg font-semibold">AI Digest</h3>
                  {data?.cached && (
                    <Badge variant="secondary" className="text-[10px]">Cached</Badge>
                  )}
                </div>

                {generating && (
                  <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span className="text-sm">Analyzing team metrics with AI...</span>
                  </div>
                )}

                {!generating && data?.markdown ? (
                  <div className="gh-markdown max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {data.markdown}
                    </ReactMarkdown>
                  </div>
                ) : !generating ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground mb-3">
                      No AI digest generated yet. Click the button above to analyze your team metrics.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
