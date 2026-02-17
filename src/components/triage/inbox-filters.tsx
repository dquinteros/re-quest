"use client";

import { useMemo } from "react";
import { ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MultiSelectFilter } from "@/components/multi-select-filter";
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
            <Select
              id={TRIAGE_CONTROL_IDS.filterReviewState}
              value={filters.reviewState}
              onChange={(e) => onPatchFilters({ reviewState: e.target.value as Filters["reviewState"] })}
              className="h-7 text-[11px]"
            >
              {REVIEW_STATE_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? value.replace(/_/g, " ").toLowerCase() : "Any review"}
                </option>
              ))}
            </Select>
            <Select
              id={TRIAGE_CONTROL_IDS.filterCiState}
              value={filters.ciState}
              onChange={(e) => onPatchFilters({ ciState: e.target.value as Filters["ciState"] })}
              className="h-7 text-[11px]"
            >
              {CI_STATE_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? `CI: ${value.toLowerCase()}` : "Any CI"}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Select
              id={TRIAGE_CONTROL_IDS.filterDraft}
              value={filters.draft}
              onChange={(e) => onPatchFilters({ draft: e.target.value as Filters["draft"] })}
              className="h-7 text-[11px]"
            >
              <option value="all">All drafts</option>
              <option value="false">Non-draft</option>
              <option value="true">Draft only</option>
            </Select>
            <Select
              id={TRIAGE_CONTROL_IDS.filterSort}
              value={filters.sort}
              onChange={(e) => onPatchFilters({ sort: e.target.value as Filters["sort"] })}
              className="h-7 text-[11px]"
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
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
