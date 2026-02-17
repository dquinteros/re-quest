import { useCallback, useEffect, useMemo, useState } from "react";
import type { DependenciesResponse } from "@/types/pr";
import { requestJson } from "@/lib/request";

export interface DependencyFilters {
  repo: string[];
  author: string[];
  ciState: "" | "FAILURE" | "PENDING" | "SUCCESS" | "UNKNOWN";
  assigned: "all" | "true" | "false";
  sort: "urgency" | "updated_desc" | "updated_asc" | "repo";
}

export const DEFAULT_DEPENDENCY_FILTERS: DependencyFilters = {
  repo: [],
  author: [],
  ciState: "",
  assigned: "all",
  sort: "repo",
};

function buildQuery(filters: DependencyFilters): string {
  const params = new URLSearchParams();

  if (filters.repo.length > 0) params.set("repo", filters.repo.join(","));
  if (filters.author.length > 0) params.set("author", filters.author.join(","));
  if (filters.ciState) params.set("ciState", filters.ciState);
  if (filters.assigned !== "all") params.set("assigned", filters.assigned);
  params.set("sort", filters.sort);

  return params.toString();
}

export interface UseDependenciesResult {
  data: DependenciesResponse | null;
  loading: boolean;
  error: string | null;
  filters: DependencyFilters;
  setFilter: <K extends keyof DependencyFilters>(key: K, value: DependencyFilters[K]) => void;
  resetFilters: () => void;
  selectedIds: Set<string>;
  toggleSelected: (id: string) => void;
  toggleGroup: (repository: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  refresh: () => void;
}

export function useDependencies(): UseDependenciesResult {
  const [filters, setFilters] = useState<DependencyFilters>(DEFAULT_DEPENDENCY_FILTERS);
  const [data, setData] = useState<DependenciesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const query = useMemo(() => buildQuery(filters), [filters]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const response = await requestJson<DependenciesResponse>(
          `/api/inbox/dependencies?${query}`,
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;
        setData(response);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load dependencies");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [query, refreshToken]);

  const setFilter = useCallback(
    <K extends keyof DependencyFilters>(key: K, value: DependencyFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_DEPENDENCY_FILTERS);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleGroup = useCallback(
    (repository: string) => {
      if (!data) return;
      const group = data.groups.find((g) => g.repository === repository);
      if (!group) return;

      setSelectedIds((prev) => {
        const next = new Set(prev);
        const groupIds = group.items.map((item) => item.id);
        const allSelected = groupIds.every((id) => next.has(id));

        if (allSelected) {
          for (const id of groupIds) next.delete(id);
        } else {
          for (const id of groupIds) next.add(id);
        }
        return next;
      });
    },
    [data],
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const selectAll = useCallback(() => {
    if (!data) return;
    const allIds = data.groups.flatMap((g) => g.items.map((item) => item.id));
    setSelectedIds(new Set(allIds));
  }, [data]);

  const refresh = useCallback(() => {
    setRefreshToken((v) => v + 1);
    setSelectedIds(new Set());
  }, []);

  return {
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
    selectAll,
    refresh,
  };
}
