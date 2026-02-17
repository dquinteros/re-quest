"use client";

import { useState, useCallback, useMemo, type FormEvent } from "react";
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
  Terminal,
  RotateCw,
  AlertTriangle,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { AppNav } from "@/components/app-nav";
import { useTheme } from "@/hooks/use-theme";
import {
  useDependencies,
  DEFAULT_DEPENDENCY_FILTERS,
  type DependencyFilters,
} from "@/hooks/use-dependencies";
import { requestJson } from "@/lib/request";
import { cn } from "@/lib/utils";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import type { PullRequestListItem, DependencyGroup } from "@/types/pr";

/* ------------------------------------------------------------------ */
/*  Dependabot command definitions                                     */
/* ------------------------------------------------------------------ */

interface DependabotCommand {
  label: string;
  command: string;
  description: string;
  destructive?: boolean;
}

interface DependabotCommandGroup {
  label: string;
  commands: DependabotCommand[];
}

const DEPENDABOT_COMMAND_GROUPS: DependabotCommandGroup[] = [
  {
    label: "Quick Actions",
    commands: [
      {
        label: "Rebase",
        command: "@dependabot rebase",
        description: "Rebase this PR onto the base branch",
      },
      {
        label: "Recreate",
        command: "@dependabot recreate",
        description: "Recreate this PR, overwriting any edits",
        destructive: true,
      },
    ],
  },
  {
    label: "Ignore (closes PR)",
    commands: [
      {
        label: "Ignore this dependency",
        command: "@dependabot ignore this dependency",
        description: "Stop all updates for this dependency",
        destructive: true,
      },
      {
        label: "Ignore major version",
        command: "@dependabot ignore this major version",
        description: "Stop major version updates for this dependency",
        destructive: true,
      },
      {
        label: "Ignore minor version",
        command: "@dependabot ignore this minor version",
        description: "Stop minor version updates for this dependency",
        destructive: true,
      },
      {
        label: "Ignore patch version",
        command: "@dependabot ignore this patch version",
        description: "Stop patch version updates for this dependency",
        destructive: true,
      },
    ],
  },
  {
    label: "Info",
    commands: [
      {
        label: "Show ignore conditions",
        command: "@dependabot show ignore conditions",
        description: "List current ignore rules for this dependency",
      },
    ],
  },
];

const BATCH_COMMANDS: DependabotCommand[] = [
  {
    label: "Rebase all",
    command: "@dependabot rebase",
    description: "Rebase all selected PRs",
  },
  {
    label: "Recreate all",
    command: "@dependabot recreate",
    description: "Recreate all selected PRs (overwrites edits)",
    destructive: true,
  },
];

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

/* ------------------------------------------------------------------ */
/*  Confirmation dialog for destructive commands                       */
/* ------------------------------------------------------------------ */

function ConfirmCommandDialog({
  open,
  command,
  prLabel,
  onConfirm,
  onCancel,
  sending,
}: {
  open: boolean;
  command: DependabotCommand | null;
  prLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  sending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Confirm command
          </DialogTitle>
          <DialogDescription>
            This will post{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
              {command?.command}
            </code>{" "}
            on <span className="font-medium text-foreground">{prLabel}</span>.
            {command?.command.includes("ignore") &&
              " This closes the PR and prevents future updates."}
            {command?.command === "@dependabot recreate" &&
              " This overwrites any manual edits on the PR."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <DialogClose asChild>
            <Button variant="outline" size="sm" disabled={sending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            onClick={onConfirm}
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
            ) : null}
            Send command
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/*  Dependabot command popover menu                                    */
/* ------------------------------------------------------------------ */

function DependabotCommandMenu({
  prId,
  prTitle,
  prNumber,
  onSendCommand,
  sending,
}: {
  prId: string;
  prTitle: string;
  prNumber: number;
  onSendCommand: (prId: string, command: string) => Promise<void>;
  sending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [confirmCmd, setConfirmCmd] = useState<DependabotCommand | null>(null);
  const [localSending, setLocalSending] = useState(false);

  const isBusy = sending || localSending;

  const handleClick = (cmd: DependabotCommand) => {
    if (cmd.destructive) {
      setOpen(false);
      setConfirmCmd(cmd);
    } else {
      setOpen(false);
      void fireCommand(cmd.command);
    }
  };

  const fireCommand = async (command: string) => {
    setLocalSending(true);
    try {
      await onSendCommand(prId, command);
    } finally {
      setLocalSending(false);
      setConfirmCmd(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            disabled={isBusy}
          >
            {isBusy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Terminal className="h-3 w-3" />
            )}
            Commands
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64 p-0"
        >
          <div className="px-3 py-2 border-b border-border">
            <p className="text-xs font-medium text-muted-foreground">
              Dependabot commands
            </p>
          </div>
          <div className="py-1">
            {DEPENDABOT_COMMAND_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {group.label}
                </p>
                {group.commands.map((cmd) => (
                  <button
                    key={cmd.command}
                    type="button"
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors flex items-start gap-2",
                      cmd.destructive && "text-destructive hover:text-destructive",
                    )}
                    onClick={() => handleClick(cmd)}
                    disabled={isBusy}
                  >
                    <span className="flex-1">
                      <span className="font-medium block">{cmd.label}</span>
                      <span className="text-[10px] text-muted-foreground block mt-0.5">
                        {cmd.description}
                      </span>
                    </span>
                    {cmd.destructive && (
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <ConfirmCommandDialog
        open={confirmCmd !== null}
        command={confirmCmd}
        prLabel={`#${prNumber} ${prTitle}`}
        onConfirm={() => {
          if (confirmCmd) void fireCommand(confirmCmd.command);
        }}
        onCancel={() => setConfirmCmd(null)}
        sending={localSending}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  PR row                                                             */
/* ------------------------------------------------------------------ */

function DependencyPrRow({
  item,
  isSelected,
  onToggle,
  onAssign,
  onSendCommand,
  assigning,
  sendingCommand,
}: {
  item: PullRequestListItem;
  isSelected: boolean;
  onToggle: () => void;
  onAssign: (id: string, login: string) => void;
  onSendCommand: (prId: string, command: string) => Promise<void>;
  assigning: boolean;
  sendingCommand: boolean;
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
          <>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setShowAssign(true)}
            >
              <UserPlus className="h-3 w-3" />
              Assign
            </Button>
            <DependabotCommandMenu
              prId={item.id}
              prTitle={item.title}
              prNumber={item.number}
              onSendCommand={onSendCommand}
              sending={sendingCommand}
            />
          </>
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
  onSendCommand,
  assigning,
  sendingCommand,
}: {
  group: DependencyGroup;
  selectedIds: Set<string>;
  onToggleItem: (id: string) => void;
  onToggleGroup: (repository: string) => void;
  onAssign: (id: string, login: string) => void;
  onSendCommand: (prId: string, command: string) => Promise<void>;
  assigning: boolean;
  sendingCommand: boolean;
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
              onSendCommand={onSendCommand}
              assigning={assigning}
              sendingCommand={sendingCommand}
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
  repoOptions,
  authorOptions,
}: {
  filters: DependencyFilters;
  onSetFilter: <K extends keyof DependencyFilters>(
    key: K,
    value: DependencyFilters[K],
  ) => void;
  onReset: () => void;
  activeCount: number;
  repoOptions: string[];
  authorOptions: string[];
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="h-3.5 w-3.5" />
        <span>Filters</span>
      </div>

      <MultiSelectFilter
        label="Repo"
        options={repoOptions}
        selected={filters.repo}
        onSelectionChange={(v) => onSetFilter("repo", v)}
        placeholder="Search repos..."
      />

      <MultiSelectFilter
        label="Author"
        options={authorOptions}
        selected={filters.author}
        onSelectionChange={(v) => onSetFilter("author", v)}
        placeholder="Search authors..."
      />

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
  onBatchCommand,
  onClear,
  assigning,
  sendingCommand,
}: {
  count: number;
  onAssign: (login: string) => void;
  onBatchCommand: (command: string) => Promise<void>;
  onClear: () => void;
  assigning: boolean;
  sendingCommand: boolean;
}) {
  const [batchLogin, setBatchLogin] = useState("");
  const [confirmCmd, setConfirmCmd] = useState<DependabotCommand | null>(null);
  const [localSending, setLocalSending] = useState(false);

  const isBusy = assigning || sendingCommand || localSending;

  const handleBatchAssign = (e: FormEvent) => {
    e.preventDefault();
    if (!batchLogin.trim()) return;
    onAssign(batchLogin.trim());
    setBatchLogin("");
  };

  const handleBatchCmd = (cmd: DependabotCommand) => {
    if (cmd.destructive) {
      setConfirmCmd(cmd);
    } else {
      void fireBatchCommand(cmd.command);
    }
  };

  const fireBatchCommand = async (command: string) => {
    setLocalSending(true);
    try {
      await onBatchCommand(command);
    } finally {
      setLocalSending(false);
      setConfirmCmd(null);
    }
  };

  if (count === 0) return null;

  return (
    <>
      <div className="sticky bottom-0 z-10 flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 backdrop-blur-sm rounded-lg flex-wrap">
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
            disabled={isBusy || !batchLogin.trim()}
          >
            {assigning ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserPlus className="h-3 w-3" />
            )}
            Assign all
          </Button>
        </form>

        <div className="flex items-center gap-1.5 border-l border-primary/20 pl-3 ml-1">
          {BATCH_COMMANDS.map((cmd) => (
            <Button
              key={cmd.command}
              variant={cmd.destructive ? "outline" : "secondary"}
              size="sm"
              className={cn(
                "h-8 text-xs gap-1",
                cmd.destructive && "border-destructive/40 text-destructive hover:bg-destructive/10",
              )}
              disabled={isBusy}
              onClick={() => handleBatchCmd(cmd)}
            >
              {localSending && confirmCmd?.command === cmd.command ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : cmd.command.includes("rebase") ? (
                <RotateCw className="h-3 w-3" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              {cmd.label}
            </Button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs ml-auto"
          onClick={onClear}
        >
          Clear selection
        </Button>
      </div>

      <ConfirmCommandDialog
        open={confirmCmd !== null}
        command={confirmCmd}
        prLabel={`${count} selected ${count === 1 ? "PR" : "PRs"}`}
        onConfirm={() => {
          if (confirmCmd) void fireBatchCommand(confirmCmd.command);
        }}
        onCancel={() => setConfirmCmd(null)}
        sending={localSending}
      />
    </>
  );
}

export interface DependenciesPageProps {
  viewerLabel?: string | null;
}

export function DependenciesPage({ viewerLabel }: DependenciesPageProps) {
  const { theme, toggleTheme } = useTheme();
  const [signingOut, setSigningOut] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [sendingCommand, setSendingCommand] = useState(false);
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

  const repoOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.groups.map((g) => g.repository))).sort();
  }, [data]);

  const authorOptions = useMemo(() => {
    if (!data) return [];
    const authors = new Set<string>();
    for (const group of data.groups) {
      for (const item of group.items) {
        authors.add(item.authorLogin);
      }
    }
    return Array.from(authors).sort();
  }, [data]);

  const activeFilterCount = [
    filters.repo.length > 0,
    filters.author.length > 0,
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

  const sendDependabotCommand = useCallback(
    async (prId: string, command: string) => {
      setSendingCommand(true);
      try {
        await requestJson(
          `/api/prs/${encodeURIComponent(prId)}/comments`,
          {
            method: "POST",
            body: JSON.stringify({ body: command }),
          },
        );
        toast.success(`Sent: ${command}`);
        refresh();
      } catch (err) {
        toast.error(
          `Failed to send command: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      } finally {
        setSendingCommand(false);
      }
    },
    [refresh],
  );

  const batchSendCommand = useCallback(
    async (command: string) => {
      setSendingCommand(true);
      try {
        const ids = Array.from(selectedIds);
        const results = await Promise.allSettled(
          ids.map((id) =>
            requestJson(
              `/api/prs/${encodeURIComponent(id)}/comments`,
              {
                method: "POST",
                body: JSON.stringify({ body: command }),
              },
            ),
          ),
        );
        const succeeded = results.filter((r) => r.status === "fulfilled").length;
        const failed = results.filter((r) => r.status === "rejected").length;
        if (failed === 0) {
          toast.success(`Sent "${command}" to ${succeeded} ${succeeded === 1 ? "PR" : "PRs"}`);
        } else {
          toast.warning(
            `Sent to ${succeeded} ${succeeded === 1 ? "PR" : "PRs"}, failed for ${failed}`,
          );
        }
        clearSelection();
        refresh();
      } catch {
        toast.error("Failed to send batch command");
        refresh();
      } finally {
        setSendingCommand(false);
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
            repoOptions={repoOptions}
            authorOptions={authorOptions}
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
                  onSendCommand={sendDependabotCommand}
                  assigning={assigning}
                  sendingCommand={sendingCommand}
                />
              ))}
            </div>
          )}

          {selectedIds.size > 0 && (
            <BatchActionBar
              count={selectedIds.size}
              onAssign={batchAssign}
              onBatchCommand={batchSendCommand}
              onClear={clearSelection}
              assigning={assigning}
              sendingCommand={sendingCommand}
            />
          )}
        </div>
      </main>
    </div>
  );
}
