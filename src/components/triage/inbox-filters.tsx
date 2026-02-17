"use client";

import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectFilter } from "@/components/multi-select-filter";
import { SingleSelectFilter } from "@/components/single-select-filter";
import type { SingleSelectOption } from "@/components/single-select-filter";
import {
  CI_STATE_OPTIONS,
  DEFAULT_FILTERS,
  REVIEW_STATE_OPTIONS,
  SORT_OPTIONS,
  TRIAGE_CONTROL_IDS,
  type Filters,
} from "./contracts";
import { cn } from "@/lib/utils";
import { useState } from "react";

const REVIEW_STATE_SELECT_OPTIONS: SingleSelectOption[] = REVIEW_STATE_OPTIONS.map(
  (value) => ({
    value,
    label: value ? value.replace(/_/g, " ").toLowerCase() : "Any review",
  }),
);

const CI_STATE_SELECT_OPTIONS: SingleSelectOption[] = CI_STATE_OPTIONS.map(
  (value) => ({
    value,
    label: value ? `CI: ${value.toLowerCase()}` : "Any CI",
  }),
);

const DRAFT_SELECT_OPTIONS: SingleSelectOption[] = [
  { value: "all", label: "All drafts" },
  { value: "false", label: "Non-draft" },
  { value: "true", label: "Draft only" },
];

const SORT_SELECT_OPTIONS: SingleSelectOption[] = SORT_OPTIONS.map(
  (option) => ({
    value: option.value,
    label: option.label,
  }),
);

function getActiveFilterCount(filters: Filters): number {
  let count = 0;
  if (filters.q.trim()) count++;
  if (filters.repo.length > 0) count++;
  if (filters.author.length > 0) count++;
  if (filters.reviewState) count++;
  if (filters.ciState) count++;
  if (filters.draft !== "all") count++;
  if (filters.sort !== DEFAULT_FILTERS.sort) count++;
  return count;
}

interface InboxFiltersProps {
  filters: Filters;
  repoOptions: string[];
  authorOptions: string[];
  onPatchFilters: (patch: Partial<Filters>) => void;
  onClearFilters: () => void;
}

export function InboxFilters({ filters, repoOptions, authorOptions, onPatchFilters, onClearFilters }: InboxFiltersProps) {
  const [open, setOpen] = useState(false);
  const activeCount = useMemo(() => getActiveFilterCount(filters), [filters]);

  return (
    <div className="px-3">
      {/* Search always visible */}
      <Input
        id={TRIAGE_CONTROL_IDS.filterSearch}
        data-control-id={TRIAGE_CONTROL_IDS.filterSearch}
        data-shortcut-target={TRIAGE_CONTROL_IDS.filterSearch}
        type="search"
        placeholder="Search PRs... ( / )"
        value={filters.q}
        onChange={(e) => onPatchFilters({ q: e.target.value })}
        className="h-8 text-xs"
      />

      {/* Toggle for advanced filters */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 mt-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
        Filters
        {activeCount > 0 && (
          <span className="ml-1 rounded-full bg-primary/10 text-primary px-1.5 text-[10px] font-medium">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2 space-y-2 animate-in fade-in-0 slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-2 gap-2">
            <MultiSelectFilter
              label="Repo"
              options={repoOptions}
              selected={filters.repo}
              onSelectionChange={(v) => onPatchFilters({ repo: v })}
              placeholder="Search repos..."
            />
            <MultiSelectFilter
              label="Author"
              options={authorOptions}
              selected={filters.author}
              onSelectionChange={(v) => onPatchFilters({ author: v })}
              placeholder="Search authors..."
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SingleSelectFilter
              label="Review state"
              options={REVIEW_STATE_SELECT_OPTIONS}
              value={filters.reviewState}
              onValueChange={(v) => onPatchFilters({ reviewState: v as Filters["reviewState"] })}
              searchable={false}
            />
            <SingleSelectFilter
              label="CI state"
              options={CI_STATE_SELECT_OPTIONS}
              value={filters.ciState}
              onValueChange={(v) => onPatchFilters({ ciState: v as Filters["ciState"] })}
              searchable={false}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <SingleSelectFilter
              label="Draft"
              options={DRAFT_SELECT_OPTIONS}
              value={filters.draft}
              onValueChange={(v) => onPatchFilters({ draft: v as Filters["draft"] })}
              defaultValue="all"
              searchable={false}
            />
            <SingleSelectFilter
              label="Sort"
              options={SORT_SELECT_OPTIONS}
              value={filters.sort}
              onValueChange={(v) => onPatchFilters({ sort: v as Filters["sort"] })}
              defaultValue={DEFAULT_FILTERS.sort}
              searchable={false}
            />
          </div>
          {activeCount > 0 && (
            <Button
              id={TRIAGE_CONTROL_IDS.clearFilters}
              variant="ghost"
              size="sm"
              className="h-7 text-[11px] w-full"
              onClick={onClearFilters}
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
