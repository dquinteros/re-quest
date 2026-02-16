"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw, RotateCcw, Save, Trash2, X } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { requestJson } from "@/lib/request";
import { Button } from "@/components/ui/button";
import { AppNav } from "./app-nav";

interface FlowRule {
  sourcePattern: string;
  allowedTargets: string[];
}

interface FlowConfigEntry {
  repoFullName: string;
  rules: FlowRule[];
  isCustom: boolean;
}

interface FlowConfigListResponse {
  configs: FlowConfigEntry[];
  defaultRules: FlowRule[];
}

interface FlowConfigSingleResponse {
  repoFullName: string;
  rules: FlowRule[];
  isCustom: boolean;
}

interface TrackedRepoItem {
  fullName: string;
  owner: string;
  name: string;
}

const FLOW_CONFIG_ENDPOINT = "/api/flow-config";
const TRACKED_REPOS_ENDPOINT = "/api/tracked-repos";

interface FlowConfigPageProps {
  viewerLabel?: string | null;
}

export function FlowConfigPage({ viewerLabel = null }: FlowConfigPageProps) {
  const { theme, toggleTheme } = useTheme();

  const [trackedRepos, setTrackedRepos] = useState<TrackedRepoItem[]>([]);
  const [configs, setConfigs] = useState<Map<string, FlowConfigEntry>>(new Map());
  const [defaultRules, setDefaultRules] = useState<FlowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [editingRepo, setEditingRepo] = useState<string | null>(null);
  const [editRules, setEditRules] = useState<FlowRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [configRes, reposRes] = await Promise.all([
        requestJson<FlowConfigListResponse>(FLOW_CONFIG_ENDPOINT),
        requestJson<{ trackedRepos?: TrackedRepoItem[] } | TrackedRepoItem[]>(
          TRACKED_REPOS_ENDPOINT,
        ),
      ]);

      setDefaultRules(configRes.defaultRules);

      const configMap = new Map<string, FlowConfigEntry>();
      for (const config of configRes.configs) {
        configMap.set(config.repoFullName, config);
      }
      setConfigs(configMap);

      const repos: TrackedRepoItem[] = Array.isArray(reposRes)
        ? reposRes
        : Array.isArray(reposRes?.trackedRepos)
          ? reposRes.trackedRepos
          : [];
      setTrackedRepos(repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function getConfigForRepo(fullName: string): FlowConfigEntry {
    return (
      configs.get(fullName) ?? {
        repoFullName: fullName,
        rules: defaultRules,
        isCustom: false,
      }
    );
  }

  function startEditing(fullName: string) {
    const config = getConfigForRepo(fullName);
    setEditingRepo(fullName);
    setEditRules(config.rules.map((r) => ({ ...r, allowedTargets: [...r.allowedTargets] })));
    setActionMessage(null);
  }

  function cancelEditing() {
    setEditingRepo(null);
    setEditRules([]);
  }

  function addRule() {
    setEditRules((prev) => [...prev, { sourcePattern: "", allowedTargets: [""] }]);
  }

  function removeRule(index: number) {
    setEditRules((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRuleSource(index: number, value: string) {
    setEditRules((prev) =>
      prev.map((r, i) => (i === index ? { ...r, sourcePattern: value } : r)),
    );
  }

  function updateRuleTarget(ruleIndex: number, targetIndex: number, value: string) {
    setEditRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIndex) return r;
        const newTargets = [...r.allowedTargets];
        newTargets[targetIndex] = value;
        return { ...r, allowedTargets: newTargets };
      }),
    );
  }

  function addTarget(ruleIndex: number) {
    setEditRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIndex) return r;
        return { ...r, allowedTargets: [...r.allowedTargets, ""] };
      }),
    );
  }

  function removeTarget(ruleIndex: number, targetIndex: number) {
    setEditRules((prev) =>
      prev.map((r, i) => {
        if (i !== ruleIndex) return r;
        const newTargets = r.allowedTargets.filter((_, ti) => ti !== targetIndex);
        return { ...r, allowedTargets: newTargets.length > 0 ? newTargets : [""] };
      }),
    );
  }

  async function saveRules() {
    if (!editingRepo) return;

    const cleanRules = editRules
      .filter((r) => r.sourcePattern.trim())
      .map((r) => ({
        sourcePattern: r.sourcePattern.trim(),
        allowedTargets: r.allowedTargets
          .map((t) => t.trim())
          .filter(Boolean),
      }))
      .filter((r) => r.allowedTargets.length > 0);

    if (cleanRules.length === 0) {
      setActionMessage("At least one valid rule is required.");
      return;
    }

    setSaving(true);
    setActionMessage(null);

    try {
      const res = await requestJson<FlowConfigSingleResponse>(FLOW_CONFIG_ENDPOINT, {
        method: "PUT",
        body: JSON.stringify({ repoFullName: editingRepo, rules: cleanRules }),
      });

      setConfigs((prev) => {
        const next = new Map(prev);
        next.set(res.repoFullName, res);
        return next;
      });

      setEditingRepo(null);
      setEditRules([]);
      setActionMessage(`Saved flow rules for ${editingRepo}.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault(fullName: string) {
    setSaving(true);
    setActionMessage(null);

    try {
      await requestJson<FlowConfigSingleResponse>(
        `${FLOW_CONFIG_ENDPOINT}?repo=${encodeURIComponent(fullName)}`,
        { method: "DELETE" },
      );

      setConfigs((prev) => {
        const next = new Map(prev);
        next.delete(fullName);
        return next;
      });

      if (editingRepo === fullName) {
        setEditingRepo(null);
        setEditRules([]);
      }

      setActionMessage(`Reset ${fullName} to default rules.`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Failed to reset");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut({ redirect: false, callbackUrl: "/" });
      window.location.assign("/");
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : "Unable to sign out");
      setSigningOut(false);
    }
  }

  return (
    <>
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        signingOut={signingOut}
        authenticated
        onToggleTheme={toggleTheme}
        onSignOut={() => void handleSignOut()}
      />
      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Flow Configuration</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure git flow rules per repository. PRs that violate these rules will be flagged in the inbox.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs shrink-0"
            onClick={() => void loadData()}
            disabled={loading}
          >
            <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {/* Default rules reference */}
        <div className="rounded-lg border border-border p-4 space-y-3">
          <h2 className="text-sm font-medium text-foreground">Default flow rules</h2>
          <p className="text-xs text-muted-foreground">
            Applied to all repositories unless overridden with a custom configuration.
          </p>
          <div className="space-y-1">
            {defaultRules.map((rule, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-mono">
                <code className="bg-muted px-1.5 py-0.5 rounded">{rule.sourcePattern}</code>
                <span className="text-muted-foreground">&rarr;</span>
                {rule.allowedTargets.map((target, ti) => (
                  <code key={ti} className="bg-muted px-1.5 py-0.5 rounded">
                    {target}
                  </code>
                ))}
              </div>
            ))}
            {defaultRules.length === 0 && !loading && (
              <p className="text-xs text-muted-foreground italic">No default rules loaded.</p>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="text-xs text-destructive border border-destructive/25 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 rounded-lg border border-border bg-muted/30 animate-pulse" />
            ))}
          </div>
        )}

        {/* Repository list */}
        {!loading && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-foreground">Tracked repositories</h2>
            {trackedRepos.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No tracked repositories found. Track repositories first from the Tracked Repos page.
              </p>
            ) : (
              <div className="space-y-1.5">
                {trackedRepos.map((repo) => {
                  const config = getConfigForRepo(repo.fullName);
                  const isEditing = editingRepo === repo.fullName;

                  return (
                    <div
                      key={repo.fullName}
                      className="rounded-lg border border-border overflow-hidden"
                    >
                      {/* Repo header row */}
                      <div className="flex items-center justify-between px-4 py-3 bg-background">
                        <div>
                          <p className="text-sm font-medium text-foreground">{repo.fullName}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {config.isCustom ? "Custom rules" : "Default rules"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {config.isCustom && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] px-2"
                              onClick={() => void resetToDefault(repo.fullName)}
                              disabled={saving}
                              title="Reset to default rules"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1" />
                              Reset
                            </Button>
                          )}
                          <Button
                            variant={isEditing ? "secondary" : "outline"}
                            size="sm"
                            className="h-7 text-[11px] px-2.5"
                            onClick={() => (isEditing ? cancelEditing() : startEditing(repo.fullName))}
                          >
                            {isEditing ? "Cancel" : "Edit"}
                          </Button>
                        </div>
                      </div>

                      {/* Current rules display (when not editing) */}
                      {!isEditing && (
                        <div className="px-4 pb-3 space-y-1">
                          {config.rules.map((rule, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs font-mono">
                              <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                {rule.sourcePattern}
                              </code>
                              <span className="text-muted-foreground">&rarr;</span>
                              {rule.allowedTargets.map((target, ti) => (
                                <code key={ti} className="bg-muted px-1.5 py-0.5 rounded text-[11px]">
                                  {target}
                                </code>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Rule editor (when editing) */}
                      {isEditing && (
                        <div className="px-4 pb-4 pt-2 space-y-3 border-t border-border bg-muted/10">
                          {editRules.map((rule, ruleIndex) => (
                            <div key={ruleIndex} className="flex items-start gap-2 group">
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2">
                                  <label className="text-[10px] text-muted-foreground w-14 shrink-0">
                                    Source
                                  </label>
                                  <input
                                    type="text"
                                    value={rule.sourcePattern}
                                    onChange={(e) => updateRuleSource(ruleIndex, e.target.value)}
                                    placeholder="e.g. feat/*"
                                    className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                                  />
                                </div>
                                <div className="flex items-start gap-2">
                                  <label className="text-[10px] text-muted-foreground w-14 shrink-0 pt-1.5">
                                    Targets
                                  </label>
                                  <div className="flex-1 space-y-1">
                                    {rule.allowedTargets.map((target, targetIndex) => (
                                      <div key={targetIndex} className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          value={target}
                                          onChange={(e) =>
                                            updateRuleTarget(ruleIndex, targetIndex, e.target.value)
                                          }
                                          placeholder="e.g. dev"
                                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                                        />
                                        {rule.allowedTargets.length > 1 && (
                                          <button
                                            type="button"
                                            onClick={() => removeTarget(ruleIndex, targetIndex)}
                                            className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                                            title="Remove target"
                                          >
                                            <X className="h-3 w-3" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => addTarget(ruleIndex)}
                                      className="text-[10px] text-primary hover:underline"
                                    >
                                      + Add target
                                    </button>
                                  </div>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRule(ruleIndex)}
                                className="mt-1 h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                                title="Remove rule"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}

                          <div className="flex items-center justify-between pt-2 border-t border-border/50">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[11px] px-2 gap-1"
                              onClick={addRule}
                            >
                              <Plus className="h-3 w-3" />
                              Add rule
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-[11px] px-3 gap-1"
                              onClick={() => void saveRules()}
                              disabled={saving}
                            >
                              <Save className="h-3 w-3" />
                              {saving ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Action feedback */}
        {actionMessage && (
          <div
            className="text-xs text-muted-foreground border border-border rounded-md px-3 py-2"
            aria-live="polite"
          >
            {actionMessage}
          </div>
        )}
      </main>
    </>
  );
}
