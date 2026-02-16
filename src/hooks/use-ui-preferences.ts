import { useCallback, useEffect, useState } from "react";

export const PR_SORT_VALUES = [
  "urgency",
  "updated_desc",
  "updated_asc",
  "created_desc",
  "created_asc",
] as const;
export type PrSort = (typeof PR_SORT_VALUES)[number];

const DRAFT_FILTER_VALUES = ["all", "true", "false"] as const;
const REVIEW_STATE_FILTER_VALUES = [
  "",
  "REVIEW_REQUESTED",
  "CHANGES_REQUESTED",
  "APPROVED",
  "COMMENTED",
  "UNREVIEWED",
  "DRAFT",
] as const;
const CI_STATE_FILTER_VALUES = ["", "FAILURE", "PENDING", "SUCCESS", "UNKNOWN"] as const;

export interface UiPreferenceFilters {
  q: string;
  repo: string;
  author: string;
  reviewState: (typeof REVIEW_STATE_FILTER_VALUES)[number];
  ciState: (typeof CI_STATE_FILTER_VALUES)[number];
  draft: (typeof DRAFT_FILTER_VALUES)[number];
}

export interface UiPreferences {
  filters: UiPreferenceFilters;
  sort: PrSort;
  advancedPanels: Record<string, boolean>;
  lastSelectedPrId: string | null;
}

export type PreferenceUpdater<T> = T | ((current: T) => T);

export const UI_PREFERENCES_VERSION = 1;
export const UI_PREFERENCES_STORAGE_KEY = `re-quest.ui-preferences.v${UI_PREFERENCES_VERSION}`;

export const DEFAULT_UI_FILTER_PREFERENCES: UiPreferenceFilters = {
  q: "",
  repo: "",
  author: "",
  reviewState: "",
  ciState: "",
  draft: "all",
};

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  filters: { ...DEFAULT_UI_FILTER_PREFERENCES },
  sort: "urgency",
  advancedPanels: {},
  lastSelectedPrId: null,
};

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface UiPreferencesEnvelope {
  version: number;
  data: unknown;
}

function getStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) {
    return storage;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function resolveUpdater<T>(updater: PreferenceUpdater<T>, current: T): T {
  if (typeof updater === "function") {
    return (updater as (value: T) => T)(current);
  }

  return updater;
}

function toStringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function toEnumOrFallback<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] {
  if (typeof value === "string" && allowed.includes(value)) {
    return value as T[number];
  }

  return fallback;
}

function normalizeAdvancedPanels(value: unknown): Record<string, boolean> {
  if (!isRecord(value)) {
    return {};
  }

  const normalized: Record<string, boolean> = {};
  for (const [panelId, isOpen] of Object.entries(value)) {
    if (!panelId || typeof isOpen !== "boolean") {
      continue;
    }

    normalized[panelId] = isOpen;
  }

  return normalized;
}

function normalizeLastSelectedPrId(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function createDefaultUiPreferences(): UiPreferences {
  return {
    filters: { ...DEFAULT_UI_FILTER_PREFERENCES },
    sort: DEFAULT_UI_PREFERENCES.sort,
    advancedPanels: {},
    lastSelectedPrId: null,
  };
}

export function normalizeUiPreferenceFilters(value: unknown): UiPreferenceFilters {
  const source = isRecord(value) ? value : {};
  return {
    q: toStringOrFallback(source.q, DEFAULT_UI_FILTER_PREFERENCES.q),
    repo: toStringOrFallback(source.repo, DEFAULT_UI_FILTER_PREFERENCES.repo),
    author: toStringOrFallback(source.author, DEFAULT_UI_FILTER_PREFERENCES.author),
    reviewState: toEnumOrFallback(
      source.reviewState,
      REVIEW_STATE_FILTER_VALUES,
      DEFAULT_UI_FILTER_PREFERENCES.reviewState,
    ),
    ciState: toEnumOrFallback(
      source.ciState,
      CI_STATE_FILTER_VALUES,
      DEFAULT_UI_FILTER_PREFERENCES.ciState,
    ),
    draft: toEnumOrFallback(source.draft, DRAFT_FILTER_VALUES, DEFAULT_UI_FILTER_PREFERENCES.draft),
  };
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  const source = isRecord(value) ? value : {};
  return {
    filters: normalizeUiPreferenceFilters(source.filters),
    sort: toEnumOrFallback(source.sort, PR_SORT_VALUES, DEFAULT_UI_PREFERENCES.sort),
    advancedPanels: normalizeAdvancedPanels(source.advancedPanels),
    lastSelectedPrId: normalizeLastSelectedPrId(source.lastSelectedPrId),
  };
}

function parseUiPreferencesEnvelope(value: string | null): UiPreferencesEnvelope | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    return {
      version: typeof parsed.version === "number" ? parsed.version : Number.NaN,
      data: "data" in parsed ? parsed.data : null,
    };
  } catch {
    return null;
  }
}

export function readUiPreferencesFromStorage(
  storageKey: string = UI_PREFERENCES_STORAGE_KEY,
  storage?: StorageLike | null,
): UiPreferences {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return createDefaultUiPreferences();
  }

  try {
    const envelope = parseUiPreferencesEnvelope(resolvedStorage.getItem(storageKey));
    if (!envelope || envelope.version !== UI_PREFERENCES_VERSION) {
      return createDefaultUiPreferences();
    }

    return normalizeUiPreferences(envelope.data);
  } catch {
    return createDefaultUiPreferences();
  }
}

export function writeUiPreferencesToStorage(
  preferences: UiPreferences,
  storageKey: string = UI_PREFERENCES_STORAGE_KEY,
  storage?: StorageLike | null,
): void {
  const resolvedStorage = getStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  const payload = JSON.stringify({
    version: UI_PREFERENCES_VERSION,
    data: normalizeUiPreferences(preferences),
  });

  try {
    resolvedStorage.setItem(storageKey, payload);
  } catch {
    // Ignore write failures (private mode, quota exceeded, etc).
  }
}

export function getUiPreference<K extends keyof UiPreferences>(
  preferences: UiPreferences,
  key: K,
): UiPreferences[K] {
  return preferences[key];
}

export function setUiPreference<K extends keyof UiPreferences>(
  preferences: UiPreferences,
  key: K,
  value: PreferenceUpdater<UiPreferences[K]>,
): UiPreferences {
  const nextValue = resolveUpdater(value, preferences[key]);
  return normalizeUiPreferences({
    ...preferences,
    [key]: nextValue,
  });
}

export interface UseUiPreferencesResult {
  preferences: UiPreferences;
  storageKey: string;
  getPreference: <K extends keyof UiPreferences>(key: K) => UiPreferences[K];
  setPreference: <K extends keyof UiPreferences>(
    key: K,
    value: PreferenceUpdater<UiPreferences[K]>,
  ) => void;
  setPreferences: (value: PreferenceUpdater<UiPreferences>) => void;
  setFilters: (value: PreferenceUpdater<UiPreferenceFilters>) => void;
  setFilter: <K extends keyof UiPreferenceFilters>(
    key: K,
    value: PreferenceUpdater<UiPreferenceFilters[K]>,
  ) => void;
  setSort: (value: PreferenceUpdater<PrSort>) => void;
  setAdvancedPanel: (panelId: string, value: PreferenceUpdater<boolean>) => void;
  setLastSelectedPrId: (value: PreferenceUpdater<string | null>) => void;
  resetPreferences: () => void;
}

export function useUiPreferences(
  storageKey: string = UI_PREFERENCES_STORAGE_KEY,
): UseUiPreferencesResult {
  const [preferences, setPreferencesState] = useState<UiPreferences>(() =>
    readUiPreferencesFromStorage(storageKey),
  );

  useEffect(() => {
    writeUiPreferencesToStorage(preferences, storageKey);
  }, [preferences, storageKey]);

  const setPreferences = useCallback((value: PreferenceUpdater<UiPreferences>) => {
    setPreferencesState((current) => normalizeUiPreferences(resolveUpdater(value, current)));
  }, []);

  const getPreference = useCallback(
    <K extends keyof UiPreferences>(key: K): UiPreferences[K] => getUiPreference(preferences, key),
    [preferences],
  );

  const setPreference = useCallback(
    <K extends keyof UiPreferences>(key: K, value: PreferenceUpdater<UiPreferences[K]>) => {
      setPreferencesState((current) => setUiPreference(current, key, value));
    },
    [],
  );

  const setFilters = useCallback(
    (value: PreferenceUpdater<UiPreferenceFilters>) => {
      setPreference("filters", value);
    },
    [setPreference],
  );

  const setFilter = useCallback(
    <K extends keyof UiPreferenceFilters>(key: K, value: PreferenceUpdater<UiPreferenceFilters[K]>) => {
      setFilters((current) => {
        const nextValue = resolveUpdater(value, current[key]);
        return normalizeUiPreferenceFilters({
          ...current,
          [key]: nextValue,
        });
      });
    },
    [setFilters],
  );

  const setSort = useCallback(
    (value: PreferenceUpdater<PrSort>) => {
      setPreference("sort", value);
    },
    [setPreference],
  );

  const setAdvancedPanel = useCallback(
    (panelId: string, value: PreferenceUpdater<boolean>) => {
      const normalizedPanelId = panelId.trim();
      if (!normalizedPanelId) {
        return;
      }

      setPreference("advancedPanels", (current) => {
        const currentValue = Boolean(current[normalizedPanelId]);
        const nextValue = resolveUpdater(value, currentValue);
        return normalizeAdvancedPanels({
          ...current,
          [normalizedPanelId]: nextValue,
        });
      });
    },
    [setPreference],
  );

  const setLastSelectedPrId = useCallback(
    (value: PreferenceUpdater<string | null>) => {
      setPreference("lastSelectedPrId", (current) => {
        const nextValue = resolveUpdater(value, current);
        return normalizeLastSelectedPrId(nextValue);
      });
    },
    [setPreference],
  );

  const resetPreferences = useCallback(() => {
    setPreferencesState(createDefaultUiPreferences());
  }, []);

  return {
    preferences,
    storageKey,
    getPreference,
    setPreference,
    setPreferences,
    setFilters,
    setFilter,
    setSort,
    setAdvancedPanel,
    setLastSelectedPrId,
    resetPreferences,
  };
}
