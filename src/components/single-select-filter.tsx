"use client";

import { useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export interface SingleSelectOption {
  value: string;
  label: string;
}

interface SingleSelectFilterProps {
  label: string;
  options: SingleSelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  /** The value treated as "nothing selected" (shown with the label only). Defaults to "". */
  defaultValue?: string;
  placeholder?: string;
  /** Whether to show the search input. Defaults to true when there are more than 5 options. */
  searchable?: boolean;
}

export function SingleSelectFilter({
  label,
  options,
  value,
  onValueChange,
  defaultValue = "",
  placeholder,
  searchable,
}: SingleSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const showSearch = searchable ?? options.length > 5;
  const isActive = value !== defaultValue;
  const selectedOption = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-7 text-xs gap-1 font-normal justify-between",
            isActive && "border-primary/50",
          )}
        >
          <span className="truncate">
            {isActive && selectedOption ? selectedOption.label : label}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-48 p-0" align="start">
        <Command>
          {showSearch && (
            <CommandInput
              placeholder={placeholder ?? `Search...`}
              className="h-8 text-xs"
            />
          )}
          <CommandList>
            <CommandEmpty className="py-3 text-xs">
              No results found.
            </CommandEmpty>
            <CommandGroup>
              {options.map((option) => {
                const isSelected = value === option.value;
                return (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                    }}
                    className="text-xs gap-2"
                  >
                    <Check
                      className={cn(
                        "h-3 w-3 shrink-0",
                        isSelected ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <span className="truncate">{option.label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
          {isActive && (
            <div className="border-t border-border p-1">
              <button
                type="button"
                className="w-full rounded-sm px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors flex items-center gap-1.5"
                onClick={() => {
                  onValueChange(defaultValue);
                  setOpen(false);
                }}
              >
                <X className="h-3 w-3" />
                Clear selection
              </button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
