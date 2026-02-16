"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { INBOX_PRESETS, presetControlId, type InboxPresetKey } from "./contracts";

interface InboxPresetsProps {
  activePreset: InboxPresetKey | null;
  onApplyPreset: (key: InboxPresetKey) => void;
}

export function InboxPresets({ activePreset, onApplyPreset }: InboxPresetsProps) {
  return (
    <div className="flex flex-wrap gap-1 px-3">
      {INBOX_PRESETS.map((preset) => {
        const controlId = presetControlId(preset.key);
        const isPressed = activePreset === preset.key;

        return (
          <Button
            key={preset.key}
            id={controlId}
            data-control-id={controlId}
            data-shortcut-target={controlId}
            variant={isPressed ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-7 text-[11px] px-2.5",
              isPressed && "bg-accent text-accent-foreground",
            )}
            aria-pressed={isPressed}
            onClick={() => onApplyPreset(preset.key)}
          >
            {preset.label}
          </Button>
        );
      })}
    </div>
  );
}
