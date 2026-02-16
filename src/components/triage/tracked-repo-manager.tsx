"use client";

import { useMemo, useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import type { TrackedRepository } from "@/types/pr";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { TRIAGE_CONTROL_IDS, repoToggleControlId } from "./contracts";

export interface RepoEntry extends TrackedRepository {
  tracked: boolean;
}

type FilterMode = "all" | "tracked" | "untracked";

interface TrackedRepoManagerProps {
  repos: RepoEntry[];
  loading: boolean;
  error: string | null;
  togglingRepos: Set<string>;
  onToggleTracked: (fullName: string, currentlyTracked: boolean) => void;
}

export function TrackedRepoManager({
  repos,
  loading,
  error,
  togglingRepos,
  onToggleTracked,
}: TrackedRepoManagerProps) {
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [selectedOrg, setSelectedOrg] = useState<string>("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const orgs = useMemo(() => {
    const ownerSet = new Set<string>();
    for (const repo of repos) ownerSet.add(repo.owner);
    return Array.from(ownerSet).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [repos]);

  const trackedCount = useMemo(() => repos.filter((r) => r.tracked).length, [repos]);

  const filteredRepos = useMemo(() => {
    const query = search.toLowerCase().trim();
    return repos.filter((repo) => {
      if (selectedOrg && repo.owner !== selectedOrg) return false;
      if (filterMode === "tracked" && !repo.tracked) return false;
      if (filterMode === "untracked" && repo.tracked) return false;
      if (query && !repo.fullName.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [repos, search, filterMode, selectedOrg]);

  const grouped = useMemo(() => {
    const map = new Map<string, RepoEntry[]>();
    for (const repo of filteredRepos) {
      const existing = map.get(repo.owner);
      if (existing) existing.push(repo);
      else map.set(repo.owner, [repo]);
    }
    return map;
  }, [filteredRepos]);

  function toggleGroupCollapse(owner: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(owner)) next.delete(owner);
      else next.add(owner);
      return next;
    });
  }

  if (loading && repos.length === 0) {
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Tracked repositories</h2>
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Tracked repositories</h2>
        <span className="text-xs text-muted-foreground">
          {trackedCount} of {repos.length} tracked
        </span>
      </div>

      <div className="flex gap-2">
        <Select
          id={TRIAGE_CONTROL_IDS.repoOrgFilter}
          value={selectedOrg}
          onChange={(e) => setSelectedOrg(e.target.value)}
          className="h-8 text-xs flex-1"
        >
          <option value="">All organisations</option>
          {orgs.map((org) => (
            <option key={org} value={org}>{org}</option>
          ))}
        </Select>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            id={TRIAGE_CONTROL_IDS.repoSearchInput}
            placeholder={selectedOrg ? `Search in ${selectedOrg}...` : "Search repositories..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs pl-8"
          />
        </div>
      </div>

      <div className="flex gap-0.5 rounded-md bg-muted p-0.5">
        {(["all", "tracked", "untracked"] as const).map((mode) => (
          <Button
            key={mode}
            variant={filterMode === mode ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "flex-1 h-7 text-[11px]",
              filterMode === mode && "bg-background shadow-sm",
            )}
            onClick={() => setFilterMode(mode)}
          >
            {mode === "all" ? "All" : mode === "tracked" ? "Tracked" : "Untracked"}
          </Button>
        ))}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {filteredRepos.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          {repos.length === 0
            ? "No repositories available. Check your GitHub permissions."
            : "No repositories match your filters."}
        </p>
      )}

      <ul className="space-y-1 max-h-[60vh] overflow-y-auto">
        {Array.from(grouped.entries()).map(([owner, ownerRepos]) => {
          const collapsed = collapsedGroups.has(owner);
          const ownerTrackedCount = ownerRepos.filter((r) => r.tracked).length;

          return (
            <li key={owner}>
              <button
                type="button"
                className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-medium text-foreground rounded-md hover:bg-muted/50 transition-colors"
                onClick={() => toggleGroupCollapse(owner)}
                aria-expanded={!collapsed}
              >
                <ChevronRight className={cn("h-3 w-3 transition-transform", !collapsed && "rotate-90")} />
                {owner}
                <span className="text-muted-foreground ml-auto">
                  {ownerTrackedCount}/{ownerRepos.length}
                </span>
              </button>

              {!collapsed &&
                ownerRepos.map((repo) => {
                  const controlId = repoToggleControlId(repo.fullName);
                  const toggling = togglingRepos.has(repo.fullName);

                  return (
                    <div
                      key={repo.fullName}
                      className={cn(
                        "flex items-center justify-between pl-7 pr-2 py-1.5 rounded-md transition-colors",
                        repo.tracked && "bg-primary/5",
                      )}
                    >
                      <label htmlFor={controlId} className="text-xs text-foreground cursor-pointer">
                        <span className="text-muted-foreground">{repo.owner}/</span>
                        {repo.name}
                      </label>
                      <button
                        type="button"
                        role="switch"
                        id={controlId}
                        data-control-id={controlId}
                        aria-checked={repo.tracked}
                        disabled={toggling}
                        className={cn(
                          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                          repo.tracked ? "bg-primary" : "bg-input",
                        )}
                        onClick={() => onToggleTracked(repo.fullName, repo.tracked)}
                      >
                        <span
                          className={cn(
                            "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                            repo.tracked ? "translate-x-4" : "translate-x-0",
                          )}
                        />
                      </button>
                    </div>
                  );
                })}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
