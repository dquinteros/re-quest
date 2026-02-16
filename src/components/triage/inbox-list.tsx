"use client";

import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import type { PullRequestListItem } from "@/types/pr";
import { InboxItem } from "./inbox-item";

interface InboxListProps {
  items: PullRequestListItem[];
  loading: boolean;
  selectedId: string | null;
  onSelectPullRequest: (id: string) => void;
}

export function InboxList({ items, loading, selectedId, onSelectPullRequest }: InboxListProps) {
  if (loading) {
    return (
      <div className="p-3 space-y-2" role="status" aria-label="Loading inbox">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2.5 w-3/4" />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
        <Search className="h-8 w-8 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">No pull requests</p>
        <p className="text-xs text-muted-foreground">
          Try adjusting your filters or tracking more repositories.
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="divide-y divide-border/50">
        {items.map((item) => (
          <InboxItem
            key={item.id}
            item={item}
            isActive={item.id === selectedId}
            onSelect={onSelectPullRequest}
          />
        ))}
      </div>
    </ScrollArea>
  );
}
