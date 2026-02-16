"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { Badge } from "@/components/ui/badge";
import type { PullRequestDetail } from "@/types/pr";
import { DetailAiSummary } from "./detail-ai-summary";
import { DetailRiskAssessment } from "./detail-risk-assessment";
import { DetailPrRelationships } from "./detail-pr-relationships";

interface DetailDescriptionProps {
  detail: PullRequestDetail;
}

const markdownComponents: Components = {
  // Open links in new tab
  a: ({ children, href, ...props }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
  // Checkbox inputs (GFM task lists)
  input: ({ type, checked, ...props }) => {
    if (type === "checkbox") {
      return (
        <input type="checkbox" checked={checked} disabled readOnly {...props} />
      );
    }
    return <input type={type} {...props} />;
  },
};

export function DetailDescription({ detail }: DetailDescriptionProps) {
  return (
    <div className="space-y-4">
      {/* Labels, assignees, reviewers */}
      <div className="flex flex-wrap items-center gap-1.5">
        {detail.labels.map((label) => (
          <Badge key={label} variant="secondary" className="text-[11px]">
            {label}
          </Badge>
        ))}
        {detail.assignees.length > 0 && (
          <>
            <span className="text-muted-foreground text-xs mx-1">·</span>
            {detail.assignees.map((a) => (
              <span key={a} className="text-xs text-muted-foreground">
                @{a}
              </span>
            ))}
          </>
        )}
        {detail.requestedReviewers.length > 0 && (
          <>
            <span className="text-muted-foreground text-xs mx-1">·</span>
            <span className="text-xs text-muted-foreground">Review:</span>
            {detail.requestedReviewers.map((r, i) => (
              <span key={`${r}-${i}`} className="text-xs text-muted-foreground">
                @{r}
              </span>
            ))}
          </>
        )}
      </div>

      {/* AI Summary */}
      <DetailAiSummary
        pullRequestId={detail.id}
        initialSummary={detail.aiSummary}
      />

      {/* Risk Assessment */}
      <DetailRiskAssessment
        pullRequestId={detail.id}
        initialAssessment={detail.riskAssessment}
      />

      {/* PR Relationships */}
      <DetailPrRelationships
        pullRequestId={detail.id}
        currentPrNumber={detail.number}
      />

      {/* Score breakdown */}
      {detail.scoreBreakdown && (
        <div className="grid grid-cols-3 gap-x-4 gap-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
          <span className="text-muted-foreground">Review request</span>
          <span className="text-muted-foreground">Assigned</span>
          <span className="text-muted-foreground">CI penalty</span>
          <span className="font-medium">+{detail.scoreBreakdown.reviewRequestBoost}</span>
          <span className="font-medium">+{detail.scoreBreakdown.assigneeBoost}</span>
          <span className="font-medium">+{detail.scoreBreakdown.ciPenalty}</span>
          <span className="text-muted-foreground">Staleness</span>
          <span className="text-muted-foreground">Mentions</span>
          <span className="text-muted-foreground">Draft penalty</span>
          <span className="font-medium">+{detail.scoreBreakdown.stalenessBoost}</span>
          <span className="font-medium">+{detail.scoreBreakdown.mentionBoost}</span>
          <span className="font-medium">-{detail.scoreBreakdown.draftPenalty}</span>
          <span className="text-muted-foreground">PR size</span>
          <span className="text-muted-foreground">Activity</span>
          <span className="text-muted-foreground">Commits</span>
          <span className="font-medium">+{detail.scoreBreakdown.sizeBoost ?? 0}</span>
          <span className="font-medium">+{detail.scoreBreakdown.activityBoost ?? 0}</span>
          <span className="font-medium">+{detail.scoreBreakdown.commitBoost ?? 0}</span>
          <span className="text-muted-foreground">Awaiting reply</span>
          <span />
          <span />
          <span className="font-medium">-{detail.scoreBreakdown.myLastActivityPenalty ?? 0}</span>
        </div>
      )}

      {/* Markdown body */}
      {detail.body && (
        <div className="gh-markdown max-w-none rounded-md border border-border bg-muted/20 p-4">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeRaw]}
            components={markdownComponents}
          >
            {detail.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
