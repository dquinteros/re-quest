import { useEffect, useState } from "react";
import type { PullRequestDetail } from "@/types/pr";
import { requestJson } from "@/lib/request";

export interface UsePrDetailResult {
  detail: PullRequestDetail | null;
  detailLoading: boolean;
  detailError: string | null;
}

export function usePrDetail(selectedId: string | null, refreshToken: number): UsePrDetailResult {
  const [detail, setDetail] = useState<PullRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    const controller = new AbortController();

    async function loadDetail(id: string) {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const response = await requestJson<{ pullRequest?: PullRequestDetail } | PullRequestDetail>(
          `/api/prs/${encodeURIComponent(id)}`,
          { signal: controller.signal },
        );

        if (controller.signal.aborted) return;

        const detailRecord: PullRequestDetail | null =
          response && typeof response === "object" && "pullRequest" in response
            ? response.pullRequest ?? null
            : (response as PullRequestDetail);

        setDetail(detailRecord);
      } catch (error) {
        if (controller.signal.aborted) return;
        setDetailError(error instanceof Error ? error.message : "Detail request failed");
      } finally {
        if (!controller.signal.aborted) setDetailLoading(false);
      }
    }

    void loadDetail(selectedId);
    return () => controller.abort();
  }, [selectedId, refreshToken]);

  return { detail, detailLoading, detailError };
}
