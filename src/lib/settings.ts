import { prisma } from "@/lib/db";
import type { AiFeatureType } from "@/lib/ai-cache";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AiEnabledFeatures {
  summary: boolean;
  risk: boolean;
  labels: boolean;
  reviewers: boolean;
  relationships: boolean;
  digest: boolean;
}

export interface AiSettings {
  model: string;
  timeoutMs: number;
  enabledFeatures: AiEnabledFeatures;
}

export interface CacheSettings {
  ttlHours: Record<AiFeatureType, number>;
}

export interface SyncSettings {
  intervalSeconds: number;
}

export interface ScoringWeights {
  reviewRequestBoost: number;
  assigneeBoost: number;
  ciFailurePenalty: number;
  ciPendingPenalty: number;
  stalenessMaxBoost: number;
  draftPenalty: number;
  mentionBoostPerMention: number;
  myLastActivityPenalty: number;
}

export interface AppSettings {
  ai: AiSettings;
  cache: CacheSettings;
  sync: SyncSettings;
  scoring: ScoringWeights;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                           */
/* ------------------------------------------------------------------ */

export const DEFAULT_AI_SETTINGS: AiSettings = {
  model: "",
  timeoutMs: 120_000,
  enabledFeatures: {
    summary: true,
    risk: true,
    labels: true,
    reviewers: true,
    relationships: true,
    digest: true,
  },
};

export const DEFAULT_CACHE_SETTINGS: CacheSettings = {
  ttlHours: {
    ai_summary: 24,
    ai_risk_assessment: 24,
    ai_label_suggest: 12,
    ai_reviewer_suggest: 6,
    ai_digest: 24,
    ai_dependency_detection: 12,
  },
};

export const DEFAULT_SYNC_SETTINGS: SyncSettings = {
  intervalSeconds: 60,
};

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  reviewRequestBoost: 25,
  assigneeBoost: 20,
  ciFailurePenalty: 15,
  ciPendingPenalty: 5,
  stalenessMaxBoost: 30,
  draftPenalty: 20,
  mentionBoostPerMention: 5,
  myLastActivityPenalty: 10,
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  ai: { ...DEFAULT_AI_SETTINGS },
  cache: { ...DEFAULT_CACHE_SETTINGS },
  sync: { ...DEFAULT_SYNC_SETTINGS },
  scoring: { ...DEFAULT_SCORING_WEIGHTS },
};

/* ------------------------------------------------------------------ */
/*  Normalization                                                      */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return fallback;
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  return fallback;
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  return fallback;
}

function normalizeEnabledFeatures(value: unknown): AiEnabledFeatures {
  const src = isRecord(value) ? value : {};
  const d = DEFAULT_AI_SETTINGS.enabledFeatures;
  return {
    summary: toBool(src.summary, d.summary),
    risk: toBool(src.risk, d.risk),
    labels: toBool(src.labels, d.labels),
    reviewers: toBool(src.reviewers, d.reviewers),
    relationships: toBool(src.relationships, d.relationships),
    digest: toBool(src.digest, d.digest),
  };
}

function normalizeAiSettings(value: unknown): AiSettings {
  const src = isRecord(value) ? value : {};
  return {
    model: toString(src.model, DEFAULT_AI_SETTINGS.model),
    timeoutMs: toNumber(src.timeoutMs, DEFAULT_AI_SETTINGS.timeoutMs),
    enabledFeatures: normalizeEnabledFeatures(src.enabledFeatures),
  };
}

function normalizeCacheSettings(value: unknown): CacheSettings {
  const src = isRecord(value) ? value : {};
  const ttlSrc = isRecord(src.ttlHours) ? src.ttlHours : {};
  const d = DEFAULT_CACHE_SETTINGS.ttlHours;
  return {
    ttlHours: {
      ai_summary: toNumber(ttlSrc.ai_summary, d.ai_summary),
      ai_risk_assessment: toNumber(ttlSrc.ai_risk_assessment, d.ai_risk_assessment),
      ai_label_suggest: toNumber(ttlSrc.ai_label_suggest, d.ai_label_suggest),
      ai_reviewer_suggest: toNumber(ttlSrc.ai_reviewer_suggest, d.ai_reviewer_suggest),
      ai_digest: toNumber(ttlSrc.ai_digest, d.ai_digest),
      ai_dependency_detection: toNumber(ttlSrc.ai_dependency_detection, d.ai_dependency_detection),
    },
  };
}

function normalizeSyncSettings(value: unknown): SyncSettings {
  const src = isRecord(value) ? value : {};
  const interval = toNumber(src.intervalSeconds, DEFAULT_SYNC_SETTINGS.intervalSeconds);
  return {
    intervalSeconds: Math.max(15, interval),
  };
}

function normalizeScoringWeights(value: unknown): ScoringWeights {
  const src = isRecord(value) ? value : {};
  const d = DEFAULT_SCORING_WEIGHTS;
  return {
    reviewRequestBoost: toNumber(src.reviewRequestBoost, d.reviewRequestBoost),
    assigneeBoost: toNumber(src.assigneeBoost, d.assigneeBoost),
    ciFailurePenalty: toNumber(src.ciFailurePenalty, d.ciFailurePenalty),
    ciPendingPenalty: toNumber(src.ciPendingPenalty, d.ciPendingPenalty),
    stalenessMaxBoost: toNumber(src.stalenessMaxBoost, d.stalenessMaxBoost),
    draftPenalty: toNumber(src.draftPenalty, d.draftPenalty),
    mentionBoostPerMention: toNumber(src.mentionBoostPerMention, d.mentionBoostPerMention),
    myLastActivityPenalty: toNumber(src.myLastActivityPenalty, d.myLastActivityPenalty),
  };
}

export function normalizeAppSettings(value: unknown): AppSettings {
  const src = isRecord(value) ? value : {};
  return {
    ai: normalizeAiSettings(src.ai),
    cache: normalizeCacheSettings(src.cache),
    sync: normalizeSyncSettings(src.sync),
    scoring: normalizeScoringWeights(src.scoring),
  };
}

/* ------------------------------------------------------------------ */
/*  Database helpers                                                   */
/* ------------------------------------------------------------------ */

export async function getUserSettings(userId: string): Promise<AppSettings> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { settings: true },
  });

  if (!row) {
    return { ...DEFAULT_APP_SETTINGS };
  }

  return normalizeAppSettings(row.settings);
}

export async function upsertUserSettings(
  userId: string,
  settings: AppSettings,
): Promise<AppSettings> {
  const normalized = normalizeAppSettings(settings);
  const data = JSON.parse(JSON.stringify(normalized));

  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, settings: data },
    update: { settings: data },
  });

  return normalized;
}
