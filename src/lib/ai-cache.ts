import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export type AiFeatureType =
  | "ai_summary"
  | "ai_risk_assessment"
  | "ai_label_suggest"
  | "ai_reviewer_suggest"
  | "ai_digest"
  | "ai_dependency_detection";

const DEFAULT_TTL_HOURS: Record<AiFeatureType, number> = {
  ai_summary: 24,
  ai_risk_assessment: 24,
  ai_label_suggest: 12,
  ai_reviewer_suggest: 6,
  ai_digest: 24,
  ai_dependency_detection: 12,
};

export async function getCachedResult<T>(
  featureType: AiFeatureType,
  pullRequestId?: string,
  repository?: string,
): Promise<T | null> {
  const where = pullRequestId
    ? { pullRequestId_featureType: { pullRequestId, featureType } }
    : repository
      ? undefined
      : undefined;

  if (!where && repository) {
    const entry = await prisma.aiCache.findFirst({
      where: {
        repository,
        featureType,
        expiresAt: { gt: new Date() },
      },
      orderBy: { generatedAt: "desc" },
    });

    if (!entry?.resultJson) return null;
    return entry.resultJson as T;
  }

  if (!where) return null;

  const entry = await prisma.aiCache.findUnique({ where });
  if (!entry || entry.expiresAt < new Date()) return null;
  return (entry.resultJson as T) ?? null;
}

export async function setCachedResult(
  featureType: AiFeatureType,
  result: unknown,
  options: {
    pullRequestId?: string;
    repository?: string;
    resultText?: string;
    ttlHours?: number;
  } = {},
): Promise<void> {
  const ttl = options.ttlHours ?? DEFAULT_TTL_HOURS[featureType];
  const expiresAt = new Date(Date.now() + ttl * 60 * 60 * 1000);
  const now = new Date();

  const data = {
    featureType,
    pullRequestId: options.pullRequestId ?? null,
    repository: options.repository ?? null,
    resultJson: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    resultText: options.resultText ?? null,
    generatedAt: now,
    expiresAt,
  };

  if (options.pullRequestId) {
    await prisma.aiCache.upsert({
      where: {
        pullRequestId_featureType: {
          pullRequestId: options.pullRequestId,
          featureType,
        },
      },
      create: data,
      update: data,
    });
  } else {
    await prisma.aiCache.create({ data });
  }
}

export async function invalidateCache(
  featureType: AiFeatureType,
  pullRequestId: string,
): Promise<void> {
  await prisma.aiCache.deleteMany({
    where: { pullRequestId, featureType },
  });
}
