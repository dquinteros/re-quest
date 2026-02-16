import { useCallback, useMemo, useState } from "react";
import {
  DEFAULT_FILTERS,
  INBOX_PRESETS,
  type Filters,
  type InboxPresetKey,
} from "@/components/triage/contracts";
import { useUiPreferences } from "./use-ui-preferences";

export interface UseFiltersResult {
  filters: Filters;
  activePreset: InboxPresetKey | null;
  patchFilters: (patch: Partial<Filters>) => void;
  applyPreset: (key: InboxPresetKey) => void;
  clearFilters: () => void;
}

export function useFilters(): UseFiltersResult {
  const { preferences, setPreferences } = useUiPreferences();

  const [activePreset, setActivePreset] = useState<InboxPresetKey | null>(null);

  const filters = useMemo<Filters>(
    () => ({
      ...DEFAULT_FILTERS,
      ...preferences.filters,
      sort: preferences.sort,
    }),
    [preferences.filters, preferences.sort],
  );

  const commitFilters = useCallback(
    (nextFilters: Filters) => {
      setPreferences((current) => ({
        ...current,
        filters: {
          q: nextFilters.q,
          repo: nextFilters.repo,
          author: nextFilters.author,
          reviewState: nextFilters.reviewState,
          ciState: nextFilters.ciState,
          draft: nextFilters.draft,
        },
        sort: nextFilters.sort,
      }));
    },
    [setPreferences],
  );

  const patchFilters = useCallback(
    (patch: Partial<Filters>) => {
      setActivePreset(null);
      commitFilters({ ...filters, ...patch });
    },
    [commitFilters, filters],
  );

  const applyPreset = useCallback(
    (key: InboxPresetKey) => {
      const preset = INBOX_PRESETS.find((c) => c.key === key);
      if (!preset) return;
      setActivePreset(key);
      commitFilters({ ...DEFAULT_FILTERS, ...preset.filters });
    },
    [commitFilters],
  );

  const clearFilters = useCallback(() => {
    setActivePreset(null);
    commitFilters(DEFAULT_FILTERS);
  }, [commitFilters]);

  return { filters, activePreset, patchFilters, applyPreset, clearFilters };
}
