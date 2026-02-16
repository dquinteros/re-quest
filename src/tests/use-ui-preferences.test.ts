// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  UI_PREFERENCES_STORAGE_KEY,
  UI_PREFERENCES_VERSION,
  createDefaultUiPreferences,
  useUiPreferences,
} from "@/hooks/use-ui-preferences";

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("useUiPreferences", () => {
  it("persists and restores valid state", async () => {
    const storageKey = `${UI_PREFERENCES_STORAGE_KEY}.test.persist`;

    const firstRender = renderHook(() => useUiPreferences(storageKey));

    act(() => {
      firstRender.result.current.setPreferences((current) => ({
        ...current,
        filters: {
          ...current.filters,
          q: "urgent",
          repo: "org/repo",
        },
        sort: "updated_desc",
        advancedPanels: {
          ...current.advancedPanels,
          labels: true,
        },
        lastSelectedPrId: "pr-42",
      }));
    });

    await waitFor(() => {
      expect(localStorage.getItem(storageKey)).toBeTruthy();
    });

    const storedRaw = localStorage.getItem(storageKey);
    expect(storedRaw).toBeTruthy();
    const stored = JSON.parse(storedRaw as string) as { version: number; data: unknown };
    expect(stored.version).toBe(UI_PREFERENCES_VERSION);

    firstRender.unmount();

    const restoredRender = renderHook(() => useUiPreferences(storageKey));

    expect(restoredRender.result.current.preferences.filters.q).toBe("urgent");
    expect(restoredRender.result.current.preferences.filters.repo).toBe("org/repo");
    expect(restoredRender.result.current.preferences.sort).toBe("updated_desc");
    expect(restoredRender.result.current.preferences.advancedPanels.labels).toBe(true);
    expect(restoredRender.result.current.preferences.lastSelectedPrId).toBe("pr-42");
  });

  it("falls back safely when persisted payload is invalid", async () => {
    const storageKey = `${UI_PREFERENCES_STORAGE_KEY}.test.invalid`;
    localStorage.setItem(storageKey, "{invalid-json");

    const renderResult = renderHook(() => useUiPreferences(storageKey));

    expect(renderResult.result.current.preferences).toEqual(createDefaultUiPreferences());
  });
});
