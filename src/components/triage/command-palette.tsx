"use client";

import { useEffect, useState } from "react";
import {
  ExternalLink,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCw,
  Keyboard,
  Filter,
  GitPullRequest,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import type { PullRequestListItem } from "@/types/pr";
import type { InboxPresetKey } from "./contracts";

interface CommandPaletteProps {
  items: PullRequestListItem[];
  selectedId: string | null;
  selectedUrl: string | null;
  onSelectPullRequest: (id: string) => void;
  onApplyPreset: (key: InboxPresetKey) => void;
  onClearFilters: () => void;
  onRefresh: () => void;
  onShowShortcuts: () => void;
  onFocusComment: () => void;
  onFocusReview: () => void;
  onOpenInBrowser: () => void;
}

export function CommandPalette({
  items,
  selectedId,
  selectedUrl,
  onSelectPullRequest,
  onApplyPreset,
  onClearFilters,
  onRefresh,
  onShowShortcuts,
  onFocusComment,
  onFocusReview,
  onOpenInBrowser,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search PRs..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Actions">
          <CommandItem onSelect={() => run(onFocusComment)}>
            <MessageSquare className="mr-2 h-4 w-4" />
            Comment on PR
            <CommandShortcut>C</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => run(onFocusReview)}>
            <CheckCircle2 className="mr-2 h-4 w-4" />
            Review PR
            <CommandShortcut>R</CommandShortcut>
          </CommandItem>
          {selectedUrl && (
            <CommandItem onSelect={() => run(onOpenInBrowser)}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Open in GitHub
              <CommandShortcut>O</CommandShortcut>
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(onRefresh)}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh from GitHub
          </CommandItem>
          <CommandItem onSelect={() => run(onShowShortcuts)}>
            <Keyboard className="mr-2 h-4 w-4" />
            Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Filters">
          <CommandItem onSelect={() => run(() => onApplyPreset("needs_review"))}>
            <Filter className="mr-2 h-4 w-4" />
            Needs review
          </CommandItem>
          <CommandItem onSelect={() => run(() => onApplyPreset("changes_requested"))}>
            <XCircle className="mr-2 h-4 w-4" />
            Changes requested
          </CommandItem>
          <CommandItem onSelect={() => run(() => onApplyPreset("failing_ci"))}>
            <XCircle className="mr-2 h-4 w-4" />
            Failing CI
          </CommandItem>
          <CommandItem onSelect={() => run(() => onApplyPreset("draft_only"))}>
            <Filter className="mr-2 h-4 w-4" />
            Draft only
          </CommandItem>
          <CommandItem onSelect={() => run(onClearFilters)}>
            <Search className="mr-2 h-4 w-4" />
            Clear all filters
          </CommandItem>
        </CommandGroup>

        {items.length > 0 && (
          <CommandGroup heading="Pull Requests">
            {items.slice(0, 15).map((item) => (
              <CommandItem
                key={item.id}
                onSelect={() => run(() => onSelectPullRequest(item.id))}
                className={item.id === selectedId ? "bg-accent/50" : ""}
              >
                <GitPullRequest className="mr-2 h-4 w-4 shrink-0" />
                <span className="truncate">
                  <span className="text-muted-foreground">{item.repository}</span>
                  {" "}#{item.number} {item.title}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
