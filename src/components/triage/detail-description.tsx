"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import type { Components } from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { AiFeatureBoundary } from "@/components/ai-feature-boundary";
import type { PullRequestDetail } from "@/types/pr";
import { DetailAiSummary } from "./detail-ai-summary";
import { DetailRiskAssessment } from "./detail-risk-assessment";
import { DetailPrRelationships } from "./detail-pr-relationships";

interface DetailDescriptionProps {
  detail: PullRequestDetail;
}

const ABSOLUTE_URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
const SCHEMELESS_GITHUB_HOSTS = [
  "github.com/",
  "www.github.com/",
  "raw.githubusercontent.com/",
  "user-images.githubusercontent.com/",
  "private-user-images.githubusercontent.com/",
];

function isSchemeLessGithubUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SCHEMELESS_GITHUB_HOSTS.some((prefix) => lower.startsWith(prefix));
}

const GITHUB_ATTACHMENT_HOSTS = new Set([
  "user-images.githubusercontent.com",
  "private-user-images.githubusercontent.com",
  "objects.githubusercontent.com",
  "media.githubusercontent.com",
]);

function isGithubAttachmentUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (host === "github.com" || host === "www.github.com") {
      return parsed.pathname.startsWith("/user-attachments/assets/");
    }

    return GITHUB_ATTACHMENT_HOSTS.has(host);
  } catch {
    return false;
  }
}

function toAssetProxyUrl(url: string): string {
  return `/api/github/asset?url=${encodeURIComponent(url)}`;
}

function normalizeRepoRelativePath(path: string): string {
  let normalized = path.trim();
  if (normalized.startsWith("/")) {
    normalized = normalized.slice(1);
  }
  while (normalized.startsWith("./")) {
    normalized = normalized.slice(2);
  }
  while (normalized.startsWith("../")) {
    normalized = normalized.slice(3);
  }
  return normalized;
}

function resolveMarkdownUrl(
  rawUrl: string,
  detail: PullRequestDetail,
  options?: { rawFile?: boolean; proxyImage?: boolean },
): string {
  let normalized = rawUrl.trim();
  if (!normalized || normalized.startsWith("#")) {
    return normalized;
  }

  if (normalized.startsWith("//")) {
    normalized = `https:${normalized}`;
  }
  if (isSchemeLessGithubUrl(normalized)) {
    normalized = `https://${normalized}`;
  }

  if (options?.proxyImage && isGithubAttachmentUrl(normalized)) {
    return toAssetProxyUrl(normalized);
  }

  if (ABSOLUTE_URL_SCHEME.test(normalized)) {
    return normalized;
  }

  const [pathWithQuery, hash = ""] = normalized.split("#", 2);
  const [pathPart, query = ""] = pathWithQuery.split("?", 2);
  const normalizedPath = normalizeRepoRelativePath(pathPart);
  if (!normalizedPath) {
    return normalized;
  }

  const ref = detail.headRef?.trim() || detail.baseRef?.trim() || "HEAD";
  const url = new URL(`https://github.com/${detail.repository}/blob/${ref}/${normalizedPath}`);
  if (query) {
    const searchParams = new URLSearchParams(query);
    for (const [key, value] of searchParams.entries()) {
      url.searchParams.append(key, value);
    }
  }
  if (options?.rawFile) {
    url.searchParams.set("raw", "1");
  }
  if (hash) {
    url.hash = hash;
  }
  return url.toString();
}

function getMarkdownComponents(detail: PullRequestDetail): Components {
  return {
    // Open links in new tab
    a: ({ children, href, ...props }) => {
      const resolvedHref =
        typeof href === "string" ? resolveMarkdownUrl(href, detail) : href;
      return (
        <a href={resolvedHref} target="_blank" rel="noopener noreferrer" {...props}>
          {children}
        </a>
      );
    },
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
}

export function DetailDescription({ detail }: DetailDescriptionProps) {
  const markdownComponents = getMarkdownComponents(detail);
  const markdownUrlTransform = (url: string, key: string): string =>
    resolveMarkdownUrl(url, detail, { rawFile: key === "src", proxyImage: key === "src" });

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
      <AiFeatureBoundary featureLabel="AI Summary">
        <DetailAiSummary
          pullRequestId={detail.id}
          initialSummary={detail.aiSummary}
        />
      </AiFeatureBoundary>

      {/* Risk Assessment */}
      <AiFeatureBoundary featureLabel="Risk Assessment">
        <DetailRiskAssessment
          pullRequestId={detail.id}
          initialAssessment={detail.riskAssessment}
        />
      </AiFeatureBoundary>

      {/* PR Relationships */}
      <AiFeatureBoundary featureLabel="PR Relationships">
        <DetailPrRelationships
          pullRequestId={detail.id}
          currentPrNumber={detail.number}
        />
      </AiFeatureBoundary>

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
            urlTransform={markdownUrlTransform}
            components={markdownComponents}
          >
            {detail.body}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
