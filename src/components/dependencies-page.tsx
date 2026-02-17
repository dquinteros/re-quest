"use client";

import { useState, useCallback, type FormEvent } from "react";
import {
  Bot,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  HelpCircle,
  Loader2,
  RefreshCw,
  UserPlus,
  Package,
  Filter,
  X,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AppNav } from "@/components/app-nav";
import { useTheme } from "@/hooks/use-theme";
import {
  useDependencies,
  DEFAULT_DEPENDENCY_FILTERS,
  type DependencyFilters,
} from "@/hooks/use-dependencies";
import { requestJson } from "@/lib/request";
import { cn } from "@/lib/utils";
import type { PullRequestListItem, DependencyGroup } from "@/types/pr";

function ciIcon(ciState: string) {
  switch (ciState) {
    case "SUCCESS":
      return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
    case "FAILURE":
      return <XCircle className="h-3.5 w-3.5 text-red-500" />;
    case "PENDING":
      return <Clock className="h-3.5 w-3.5 text-yellow-500" />;
    default:
      return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />;
  }
}

function DependencyPrRow({
  item,
  isSelected,
  onToggle,
  onAssign,
  assigning,
}: {
  item: PullRequestListItem;
  isSelected: boolean;
  onToggle: () => void;
  onAssign: (id: string, login: string) => void;
  assigning: boolean;
}) {
  const [showAssign, setShowAssign] = useState(false);
  const [assignLogin, setAssignLogin] = useState("");

  const handleAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!assignLogin.trim()) return;
    onAssign(item.id, assignLogin.trim());
    setAssignLogin("");
    setShowAssign(false);
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-2.5 border-b border-border/50 last:border-b-0 transition-colors",
        isSelected && "bg-primary/5",
      )}
    >
      <label className="flex items-center pt-0.5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggle}
          className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
        />
      </label>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {ciIcon(item.ciState)}
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium leading-snug truncate hover:underline text-foreground"
          >
            #{item.number} {item.title}
          </a>
        </div>

        <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
          <span>{item.authorLogin}</span>
          <span className="text-muted-foreground/40">{"\u00b7"}</span>
          <span>{new Date(item.updatedAt).toLocaleDateString()}</span>
          {item.labels.length > 0 && (
            <>
              <span className="text-muted-foreground/40">{"\u00b7"}</span>
              <div className="flex items-center gap-1">
                {item.labels.slice(0, 3).map((label) => (
                  <Badge
                    key={label}
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-4 font-normal"
                  >
                    {label}
                  </Badge>
                ))}
                {item.labels.length > 3 && (
                  <span className="text-[10px]">+{item.labels.length - 3}</span>
                )}
              </div>
            </>
          )}
          {item.assignees.length > 0 && (
            <>
              <span className="text-muted-foreground/40">{"\u00b7"}</span>
              <span className="text-primary/80 font-medium">
                {item.assignees.join(", ")}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {showAssign ? (
          <form onSubmit={handleAssign} className="flex items-center gap-1">
            <Input
              value={assignLogin}
              onChange={(e) => setAssignLogin(e.target.value)}
              placeholder="GitHub login"
              className="h-7 w-32 text-xs"
              autoFocus
            />
            <Button
              type="submit"
              size="sm"
              variant="default"
              className="h-7 text-xs px-2"
              disabled={assigning}
            >
              {assigning ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                "Assign"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setShowAssign(false)}
            >
              <X className="h-3 w-3" />
            </Button>
          </form>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={() => setShowAssign(true)}
          >
            <UserPlus className="h-3 w-3" />
            Assign
          </Button>
        )}
      </div>
    </div>
  );
}

function RepositoryGroup({
  group,
  selectedIds,
  onToggleItem,
  onToggleGroup,
  onAssign,
  assigning,
}: {
  group: DependencyGroup;
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleGroup: (repository: string) => void;
  onAssign: (id: string, login: string) => void;
  assigning: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const groupIds = group.items.map((item) => item.id);
  const allSelected =
    groupIds.length > 0 && groupIds.every((id) => selectedIds.has(id));
  const someSelected = groupIds.some((id) => selectedIds.has(id));

  const failingCount = group.items.filter(
    (item) => item.ciState === "FAILURE",
  ).length;
  const unassignedCount = group.items.filter(
    (item) => item.assignees.length === 0,
  ).length;

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <button
        type="button"
        className="flex items-center gap-3 px-4 py-3 bg-muted/30 cursor-pointer select-none w-full text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span
          className="flex items-center"
          role="presentation"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => onToggleGroup(group.repository)}
            className="h-3.5 w-3.5 rounded border-border accent-primary cursor-pointer"
          />
        </span>

        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}

        <Package className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-sm font-semibold truncate">
          {group.repository}
        </span>

        <span className="flex items-center gap-2 ml-auto shrink-0">
          {failingCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {failingCount} failing
            </Badge>
          )}
          {unassignedCount > 0 && (
            <Badge variant="outline" className="text-[10px] h-5 px-1.5">
              {unassignedCount} unassigned
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
            {group.totalCount}{" "}
            {group.totalCount === 1 ? "update" : "updates"}
          </Badge>
        </span>
      </button>

      {expanded && (
        <div>
          {group.items.map((item) => (
            <DependencyPrRow
              key={item.id}
              item={item}
              isSelected={selectedIds.has(item.id)}
              onToggle={() => onToggleItem(item.id)}
              onAssign={onAssign}
              assigning={assigning}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyFilterBar({
  filters,
  onSetFilter,
  onReset,
  activeCount,
}: {
  filters: DependencyFilters;
  onSetFilter: <K extends keyof DependencyFilters>(
    key: K,
    value: DependencyFilters[K],
  ) => void;
  onReset: () => void;
  activeCount: number;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span>Filters</span>
      </div>

      <select
        value={filters.ciState}
        onChange={(e) =>
          onSetFilter(
            "ciState",
            e.target.value as DependencyFilters["ciState"],
          )
        }
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">All CI</option>
        <option value="SUCCESS">Passing</option>
        <option value="FAILURE">Failing</option>
        <option value="PENDING">Pending</option>
      </select>

      <select
        value={filters.assigned}
        onChange={(e) =>
          onSetFilter(
            "assigned",
            e.target.value as DependencyFilters["assigned"],
          )
        }
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="all">All assignments</option>
        <option value="false">Unassigned</option>
        <option value="true">Assigned</option>
      </select>

      <select
        value={filters.sort}
        onChange={(e) =>
          onSetFilter("sort", e.target.value as DependencyFilters["sort"])
        }
        className="h-7 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="repo">By repository</option>
        <option value="urgency">By urgency</option>
        <option value="updated_desc">Newest first</option>
        <option value="updated_asc">Oldest first</option>
      </select>

      <Input
        placeholder="Filter by repo..."
        value={filters.repo}
        onChange={(e) => onSetFilter("repo", e.target.value)}
        className="h-7 w-44 text-xs"
      />

      {activeCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={onReset}
        >
          <X className="h-3 w-3" />
          Clear ({activeCount})
        </Button>
      )}
    </div>
  );
}

function BatchActionBar({
  count,
  onAssign,
  onClear,
  assigning,
}: {
  count: number;
  onAssign: (login: string) => void;
  onClear: () => void;
  assigning: boolean;
}) {
  const [batchLogin, setBatchLogin] = useState("");

  const handleBatchAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!batchLogin.trim()) return;
    onAssign(batchLogin.trim());
    setBatchLogin("");
  };

  if (count === 0) return null;

  return (
    <div className="sticky bottom-0 z-10 flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 backdrop-blur-sm rounded-lg">
      <span className="text-sm font-medium">
        {count} {count === 1 ? "PR" : "PRs"} selected
      </span>

      <form
        onSubmit={handleBatchAssign}
        className="flex items-center gap-2 ml-4"
      >
        <Input
          value={batchLogin}
          onChange={(e) => setBatchLogin(e.target.value)}
          placeholder="GitHub login to assign..."
          className="h-8 w-48 text-xs"
        />
        <Button
          type="submit"
          size="sm"
          className="h-8 text-xs gap-1"
          disabled={assigning || !batchLogin.trim()}
        >
          {assigning ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <UserPlus className="h-3 w-3" />
          )}
          Assign all
        </Button>
      </form>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 text-xs ml-auto"
        onClick={onClear}
      >
        Clear selection
      </Button>
    </div>
  );
}

export interface DependenciesPageProps {
  viewerLabel?: string | null;
}

export function DependenciesPage({ viewerLabel }: DependenciesPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const {
    data,
    loading,
    error,
    filters,
    setFilter,
    resetFilters,
    selectedIds,
    toggleSelected,
    toggleGroup,
    clearSelection,
    refresh,
  } = useDependencies();

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    await signOut({ callbackUrl: "/" });
  }, []);

  const activeFilterCount = [
    filters.repo !== DEFAULT_DEPENDENCY_FILTERS.repo,
    filters.ciState !== DEFAULT_DEPENDENCY_FILTERS.ciState,
    filters.assigned !== DEFAULT_DEPENDENCY_FILTERS.assigned,
    filters.sort !== DEFAULT_DEPENDENCY_FILTERS.sort,
  ].filter(Boolean).length;

  const assignPr = useCallback(
    async (prId: string, login: string) => {
      setAssigning(true);
      try {
        await requestJson(
          `/api/prs/${encodeURIComponent(prId)}/assignees`,
          {
            method: "POST",
            body: JSON.stringify({ assignees: [login] }),
          },
        );
        refresh();
      } catch {
        refresh();
      } finally {
        setAssigning(false);
      }
    },
    [refresh],
  );

  const batchAssign = useCallback(
    async (login: string) => {
      setAssigning(true);
      try {
        const ids = Array.from(selectedIds);
        await Promise.allSettled(
          ids.map((id) =>
            requestJson(
              `/api/prs/${encodeURIComponent(id)}/assignees`,
              {
                method: "POST",
                body: JSON.stringify({ assignees: [login] }),
              },
            ),
          ),
        );
        clearSelection();
        refresh();
      } catch {
        refresh();
      } finally {
        setAssigning(false);
      }
    },
    [selectedIds, clearSelection, refresh],
  );

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={theme === "dark" ? "Light mode" : "Dark mode"}
        signingOut={signingOut}
        onToggleTheme={toggleTheme}
        onSignOut={handleSignOut}
      />

      <main className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-muted-foreground" />
              <div>
                <h1 className="text-lg font-bold tracking-tight">
                  Dependencies
                </h1>
                <p className="text-xs text-muted-foreground">
                  Bot-authored dependency updates grouped by repository
                </p>
              </div>
              {data && (
                <Badge variant="secondary" className="ml-2">
                  {data.totalCount}{" "}
                  {data.totalCount === 1 ? "PR" : "PRs"}
                </Badge>
              )}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>

          <DependencyFilterBar
            filters={filters}
            onSetFilter={setFilter}
            onReset={resetFilters}
            activeCount={activeFilterCount}
          />

          {error && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading dependency PRs...</span>
            </div>
          )}

          {data && data.groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Package className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm font-medium">
                No dependency PRs found
              </p>
              <p className="text-xs mt-1">
                Bot-authored PRs from Dependabot, Renovate, and other bots
                will appear here.
              </p>
            </div>
          )}

          {data && data.groups.length > 0 && (
            <div className="space-y-3">
              {data.groups.map((group) => (
                <RepositoryGroup
                  key={group.repository}
                  group={group}
                  selectedIds={selectedIds}
                  onToggleItem={toggleSelected}
                  onToggleGroup={toggleGroup}
                  onAssign={assignPr}
                  assigning={assigning}
                />
              ))}
            </div>
          )}

          {selectedIds.size > 0 && (
            <BatchActionBar
              count={selectedIds.size}
              onAssign={batchAssign}
              onClear={clearSelection}
              assigning={assigning}
            />
          )}
        </div>
      </main>
    </div>
  );
}
