import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { toPullRequestDetail, toPullRequestListItem } from "@/lib/pr-dto";
import { parseFlowRules, validatePrFlow, DEFAULT_FLOW_RULES, type FlowRule } from "@/lib/git-flow";
import type { ParsedInboxQuery } from "@/lib/query";
import type { DependenciesResponse, DependencyGroup, InboxResponse, PullRequestDetail } from "@/types/pr";

const includeRelations = {
  repository: true,
  attentionState: true,
} satisfies Prisma.PullRequestInclude;

export interface OwnedPullRequestScope {
  userId: string;
  userLogin: string;
}

function containsAny(source: string[], search: string[]): boolean {
  if (!search.length) {
    return true;
  }

  const sourceSet = new Set(source.map((item) => item.toLowerCase()));
  return search.some((item) => sourceSet.has(item.toLowerCase()));
}

function jsonStringArray(value: Prisma.JsonValue): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function ownershipFilter(scope: OwnedPullRequestScope): Prisma.PullRequestWhereInput {
  return {
    OR: [
      {
        repository: {
          userId: scope.userId,
        },
      },
      {
        repository: {
          installation: {
            userId: scope.userId,
          },
        },
      },
    ],
  };
}

async function loadFlowRulesMap(userId: string): Promise<Map<string, FlowRule[]>> {
  const configs = await prisma.flowConfig.findMany({
    where: { userId },
  });

  const map = new Map<string, FlowRule[]>();
  for (const config of configs) {
    map.set(config.repoFullName, parseFlowRules(config.rules));
  }

  return map;
}

function getFlowRulesForRepo(
  repoFullName: string,
  rulesMap: Map<string, FlowRule[]>,
): FlowRule[] | undefined {
  return rulesMap.get(repoFullName);
}

export async function listInboxPullRequests(
  query: ParsedInboxQuery,
  scope: OwnedPullRequestScope,
): Promise<InboxResponse> {
  const where: Prisma.PullRequestWhereInput = {
    ...ownershipFilter(scope),
    NOT: { authorLogin: { endsWith: "[bot]" } },
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: "insensitive" } },
            { body: { contains: query.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(query.repo.length
      ? {
          OR: [
            {
              repository: {
                userId: scope.userId,
                fullName: { in: query.repo },
              },
            },
            {
              repository: {
                installation: {
                  userId: scope.userId,
                },
                fullName: { in: query.repo },
              },
            },
          ],
        }
      : {}),
    ...(query.author.length
      ? {
          authorLogin: {
            in: query.author,
          },
        }
      : {}),
    ...(query.state.length
      ? {
          state: { in: query.state },
        }
      : {}),
    ...(query.reviewState.length
      ? {
          reviewState: { in: query.reviewState },
        }
      : {}),
    ...(query.ciState.length
      ? {
          ciState: { in: query.ciState },
        }
      : {}),
    ...(query.draft === "true"
      ? { draft: true }
      : query.draft === "false"
        ? { draft: false }
        : {}),
    ...(query.updatedFrom || query.updatedTo
      ? {
          githubUpdatedAt: {
            ...(query.updatedFrom ? { gte: new Date(query.updatedFrom) } : {}),
            ...(query.updatedTo ? { lte: new Date(query.updatedTo) } : {}),
          },
        }
      : {}),
    attentionState: {
      needsAttention: true,
    },
  };

  const orderBy: Prisma.PullRequestOrderByWithRelationInput[] =
    query.sort === "urgency"
      ? [{ attentionState: { urgencyScore: "desc" } }, { githubUpdatedAt: "desc" }]
      : query.sort === "updated_asc"
        ? [{ githubUpdatedAt: "asc" }]
        : query.sort === "created_desc"
          ? [{ githubCreatedAt: "desc" }]
          : query.sort === "created_asc"
            ? [{ githubCreatedAt: "asc" }]
            : [{ githubUpdatedAt: "desc" }];

  // For label and assignee intersections, fetch a bounded set and filter in memory.
  const rawItems = await prisma.pullRequest.findMany({
    where,
    include: includeRelations,
    orderBy,
    take: query.pageSize * 5,
  });

  const filtered = rawItems.filter((item) => {
    const labels = jsonStringArray(item.labels);
    const assignees = jsonStringArray(item.assignees);

    return (
      containsAny(labels, query.label) &&
      containsAny(assignees, query.assignee)
    );
  });

  const flowRulesMap = await loadFlowRulesMap(scope.userId);

  const items = filtered.map((item) =>
    toPullRequestListItem(item, getFlowRulesForRepo(item.repository.fullName, flowRulesMap)),
  );

  const flowFiltered =
    query.flowViolation === "true"
      ? items.filter((item) => item.flowViolation !== null)
      : query.flowViolation === "false"
        ? items.filter((item) => item.flowViolation === null)
        : items;

  const offset = (query.page - 1) * query.pageSize;
  const paged = flowFiltered.slice(offset, offset + query.pageSize);

  const notBot: Prisma.PullRequestWhereInput = { NOT: { authorLogin: { endsWith: "[bot]" } } };

  const [needsReview, changesRequestedFollowUp, failingCi, hasConflicts, latestSync, allBranchRefs] =
    await Promise.all([
      prisma.pullRequest.count({
        where: {
          ...ownershipFilter(scope),
          ...notBot,
          attentionState: { needsAttention: true },
          reviewState: "REVIEW_REQUESTED",
        },
      }),
      prisma.pullRequest.count({
        where: {
          ...ownershipFilter(scope),
          ...notBot,
          attentionState: { needsAttention: true },
          reviewState: "CHANGES_REQUESTED",
        },
      }),
      prisma.pullRequest.count({
        where: {
          ...ownershipFilter(scope),
          ...notBot,
          attentionState: { needsAttention: true },
          ciState: "FAILURE",
        },
      }),
      prisma.pullRequest.count({
        where: {
          ...ownershipFilter(scope),
          ...notBot,
          attentionState: { needsAttention: true },
          mergeable: false,
        },
      }),
      prisma.syncRun.findFirst({
        where: {
          viewerLogin: scope.userLogin,
        },
        orderBy: { startedAt: "desc" },
      }),
      prisma.pullRequest.findMany({
        where: {
          ...ownershipFilter(scope),
          ...notBot,
          attentionState: { needsAttention: true },
          headRef: { not: null },
          baseRef: { not: null },
        },
        select: {
          headRef: true,
          baseRef: true,
          repository: { select: { fullName: true } },
        },
      }),
    ]);

  const flowViolations = allBranchRefs.filter((pr) => {
    const rules = getFlowRulesForRepo(pr.repository.fullName, flowRulesMap) ?? DEFAULT_FLOW_RULES;
    return validatePrFlow(pr.headRef!, pr.baseRef!, rules) !== null;
  }).length;

  return {
    items: paged,
    total: flowFiltered.length,
    badges: {
      needsReview,
      changesRequestedFollowUp,
      failingCi,
      hasConflicts,
      flowViolations,
    },
    syncedAt: latestSync?.finishedAt?.toISOString() ?? null,
  };
}

export interface ParsedDependencyQuery {
  repo: string[];
  author: string[];
  ciState: Array<"SUCCESS" | "FAILURE" | "PENDING" | "UNKNOWN">;
  assigned: "true" | "false" | "all";
  sort: "urgency" | "updated_desc" | "updated_asc" | "repo";
}

export async function listDependencyPullRequests(
  query: ParsedDependencyQuery,
  scope: OwnedPullRequestScope,
): Promise<DependenciesResponse> {
  const where: Prisma.PullRequestWhereInput = {
    ...ownershipFilter(scope),
    authorLogin: query.author.length
      ? { in: query.author }
      : { endsWith: "[bot]" },
    state: "OPEN",
    ...(query.repo.length
      ? {
          OR: [
            {
              repository: {
                userId: scope.userId,
                fullName: { in: query.repo },
              },
            },
            {
              repository: {
                installation: { userId: scope.userId },
                fullName: { in: query.repo },
              },
            },
          ],
        }
      : {}),
    ...(query.ciState.length ? { ciState: { in: query.ciState } } : {}),
  };

  const orderBy: Prisma.PullRequestOrderByWithRelationInput[] =
    query.sort === "urgency"
      ? [{ attentionState: { urgencyScore: "desc" } }, { githubUpdatedAt: "desc" }]
      : query.sort === "updated_asc"
        ? [{ githubUpdatedAt: "asc" }]
        : [{ githubUpdatedAt: "desc" }];

  const rawItems = await prisma.pullRequest.findMany({
    where,
    include: includeRelations,
    orderBy,
    take: 500,
  });

  const flowRulesMap = await loadFlowRulesMap(scope.userId);

  let items = rawItems.map((item) =>
    toPullRequestListItem(item, getFlowRulesForRepo(item.repository.fullName, flowRulesMap)),
  );

  if (query.assigned === "true") {
    items = items.filter((item) => item.assignees.length > 0);
  } else if (query.assigned === "false") {
    items = items.filter((item) => item.assignees.length === 0);
  }

  const groupMap = new Map<string, typeof items>();
  for (const item of items) {
    const existing = groupMap.get(item.repository);
    if (existing) {
      existing.push(item);
    } else {
      groupMap.set(item.repository, [item]);
    }
  }

  const groups: DependencyGroup[] = Array.from(groupMap.entries())
    .sort((a, b) => b[1].length - a[1].length)
    .map(([repository, repoItems]) => ({
      repository,
      items: repoItems,
      totalCount: repoItems.length,
    }));

  const latestSync = await prisma.syncRun.findFirst({
    where: { viewerLogin: scope.userLogin },
    orderBy: { startedAt: "desc" },
  });

  return {
    groups,
    totalCount: items.length,
    syncedAt: latestSync?.finishedAt?.toISOString() ?? null,
  };
}

export async function getPullRequestDetail(
  id: string,
  scope: OwnedPullRequestScope,
): Promise<PullRequestDetail | null> {
  const record = await prisma.pullRequest.findFirst({
    where: {
      id,
      ...ownershipFilter(scope),
    },
    include: includeRelations,
  });

  if (!record) {
    return null;
  }

  const flowRulesMap = await loadFlowRulesMap(scope.userId);
  const rules = getFlowRulesForRepo(record.repository.fullName, flowRulesMap);

  return toPullRequestDetail(record, rules);
}

export async function getPullRequestContext(id: string, scope: OwnedPullRequestScope) {
  return prisma.pullRequest.findFirst({
    where: {
      id,
      ...ownershipFilter(scope),
    },
    include: {
      repository: true,
      attentionState: true,
    },
  });
}
