import { useCallback, useEffect, useState } from "react";
import { requestJson } from "@/lib/request";
import type { AppSettings } from "@/lib/settings";

export interface UseSettingsResult {
  settings: AppSettings | null;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
  save: (next: AppSettings) => Promise<void>;
  reload: () => void;
}

export function useSettings(): UseSettingsResult {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    requestJson<AppSettings>("/api/settings")
      .then((data) => {
        if (!cancelled) {
          setSettings(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load settings");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  const save = useCallback(async (next: AppSettings) => {
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await requestJson<AppSettings>("/api/settings", {
        method: "PUT",
        body: JSON.stringify(next),
      });
      setSettings(saved);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save";
      setSaveError(msg);
      throw err;
    } finally {
      setSaving(false);
    }
  }, []);

  const reload = useCallback(() => {
    setRefreshToken((t) => t + 1);
  }, []);

  return { settings, loading, error, saving, saveError, save, reload };
}
