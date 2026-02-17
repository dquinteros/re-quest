import React, { useEffect, useMemo, useState } from "react";
import type { Filters } from "@/components/triage/contracts";
import type { InboxResponse } from "@/types/pr";
import { requestJson } from "@/lib/request";

function getInboxQuery(filters: Filters): string {
  const params = new URLSearchParams();

  if (filters.q.trim()) params.set("q", filters.q.trim());

  if (filters.repo.length) params.set("repo", filters.repo.join(","));
  if (filters.author.length) params.set("author", filters.author.join(","));

  if (filters.reviewState) params.set("reviewState", filters.reviewState);
  if (filters.ciState) params.set("ciState", filters.ciState);
  if (filters.draft !== "all") params.set("draft", filters.draft);
  if (filters.flowViolation) params.set("flowViolation", filters.flowViolation);

  params.set("sort", filters.sort);
  params.set("page", "1");
  params.set("pageSize", "50");

  return params.toString();
}

export interface UseInboxResult {
  inbox: InboxResponse | null;
  inboxLoading: boolean;
  inboxError: string | null;
  selectedId: string | null;
  setSelectedId: React.Dispatch<React.SetStateAction<string | null>>;
  refreshToken: number;
  triggerRefresh: () => void;
}

export function useInbox(filters: Filters, lastSelectedPrId: string | null): UseInboxResult {
  const [debouncedFilters, setDebouncedFilters] = useState<Filters>(filters);
  const [inbox, setInbox] = useState<InboxResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(lastSelectedPrId);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedFilters(filters);
    }, 220);
    return () => window.clearTimeout(timeout);
  }, [filters]);

  const inboxQuery = useMemo(() => getInboxQuery(debouncedFilters), [debouncedFilters]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadInbox() {
      setInboxLoading(true);
      setInboxError(null);

      try {
        const response = await requestJson<InboxResponse>(`/api/inbox/prs?${inboxQuery}`, {
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        setInbox(response);
        setSelectedId((current) => {
          if (current && response.items.some((item) => item.id === current)) return current;
          return response.items[0]?.id ?? null;
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setInboxError(error instanceof Error ? error.message : "Inbox request failed");
      } finally {
        if (!controller.signal.aborted) setInboxLoading(false);
      }
    }

    void loadInbox();
    return () => controller.abort();
  }, [inboxQuery, refreshToken]);

  const triggerRefresh = () => setRefreshToken((v) => v + 1);

  return {
    inbox,
    inboxLoading,
    inboxError,
    selectedId,
    setSelectedId,
    refreshToken,
    triggerRefresh,
  };
}
