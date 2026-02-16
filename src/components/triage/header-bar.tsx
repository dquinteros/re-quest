"use client";

import { HelpCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TRIAGE_CONTROL_IDS } from "./contracts";
import { cn } from "@/lib/utils";

interface HeaderBarProps {
  syncTimeLabel: string;
  syncing: boolean;
  onRefresh: () => void;
  onShowShortcuts: () => void;
}

export function HeaderBar({
  syncTimeLabel,
  syncing,
  onRefresh,
  onShowShortcuts,
}: HeaderBarProps) {
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-background">
      <div>
        <h1 className="text-base font-semibold text-foreground">PR Triage</h1>
        <p className="text-[11px] text-muted-foreground">{syncTimeLabel}</p>
      </div>
      <div className="flex items-center gap-1">
        <Button
          id={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
          data-control-id={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
          data-shortcut-target={TRIAGE_CONTROL_IDS.shortcutsHelpButton}
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs text-muted-foreground"
          onClick={onShowShortcuts}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Shortcuts</span>
        </Button>
        <Button
          id={TRIAGE_CONTROL_IDS.refreshFromGithub}
          data-control-id={TRIAGE_CONTROL_IDS.refreshFromGithub}
          data-shortcut-target={TRIAGE_CONTROL_IDS.refreshFromGithub}
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onRefresh}
          disabled={syncing}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", syncing && "animate-spin")} />
          {syncing ? "Syncing..." : "Refresh"}
        </Button>
      </div>
    </div>
  );
}
