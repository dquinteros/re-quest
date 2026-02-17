"use client";

import { signOut } from "next-auth/react";
import { useCallback, useState } from "react";
import { Save, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { useSettings } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AppNav } from "./app-nav";
import type {
  AppSettings,
  AiEnabledFeatures,
  ScoringWeights,
} from "@/lib/settings";
import {
  DEFAULT_SCORING_WEIGHTS,
  DEFAULT_APP_SETTINGS,
} from "@/lib/settings";

interface SettingsPageProps {
  viewerLabel?: string | null;
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer group">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <button
        role="switch"
        type="button"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${checked ? "bg-primary" : "bg-muted"}`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
        />
      </button>
    </label>
  );
}

function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  description?: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="w-24 h-8 text-sm"
        />
        {suffix && (
          <span className="text-xs text-muted-foreground">{suffix}</span>
        )}
      </div>
    </div>
  );
}

function AiSettingsTab({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}) {
  const updateAi = useCallback(
    (patch: Partial<AppSettings["ai"]>) => {
      onChange({ ...settings, ai: { ...settings.ai, ...patch } });
    },
    [settings, onChange],
  );

  const updateFeature = useCallback(
    (key: keyof AiEnabledFeatures, value: boolean) => {
      updateAi({
        enabledFeatures: { ...settings.ai.enabledFeatures, [key]: value },
      });
    },
    [settings, updateAi],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Codex Model</CardTitle>
          <CardDescription>
            The AI model used by the Codex CLI for all AI features. Leave empty
            to use the Codex default.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <Input
              placeholder="e.g. o4-mini, o3, gpt-4.1"
              value={settings.ai.model}
              onChange={(e) => updateAi({ model: e.target.value })}
              className="max-w-xs h-8 text-sm"
            />
          </div>
          <NumberField
            label="Timeout"
            description="Maximum time (ms) to wait for a Codex response before aborting."
            value={settings.ai.timeoutMs}
            onChange={(v) => updateAi({ timeoutMs: v })}
            min={5000}
            max={600000}
            step={1000}
            suffix="ms"
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enabled AI Features</CardTitle>
          <CardDescription>
            Toggle individual AI capabilities on or off.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <Toggle
            checked={settings.ai.enabledFeatures.summary}
            onChange={(v) => updateFeature("summary", v)}
            label="AI Summary"
            description="Generate concise PR summaries and key change lists."
          />
          <Toggle
            checked={settings.ai.enabledFeatures.risk}
            onChange={(v) => updateFeature("risk", v)}
            label="Risk Assessment"
            description="Analyze PRs for security, data, API and quality risks."
          />
          <Toggle
            checked={settings.ai.enabledFeatures.labels}
            onChange={(v) => updateFeature("labels", v)}
            label="Label Suggestions"
            description="Suggest labels based on PR content."
          />
          <Toggle
            checked={settings.ai.enabledFeatures.reviewers}
            onChange={(v) => updateFeature("reviewers", v)}
            label="Reviewer Suggestions"
            description="Suggest reviewers based on code ownership and workload."
          />
          <Toggle
            checked={settings.ai.enabledFeatures.relationships}
            onChange={(v) => updateFeature("relationships", v)}
            label="PR Relationships"
            description="Detect related, dependent, or conflicting PRs."
          />
          <Toggle
            checked={settings.ai.enabledFeatures.digest}
            onChange={(v) => updateFeature("digest", v)}
            label="Weekly Digest"
            description="Generate team activity digests in the Insights page."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function CacheSettingsTab({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}) {
  const updateTtl = useCallback(
    (key: string, hours: number) => {
      onChange({
        ...settings,
        cache: {
          ...settings.cache,
          ttlHours: { ...settings.cache.ttlHours, [key]: hours },
        },
      });
    },
    [settings, onChange],
  );

  const items = [
    { key: "ai_summary", label: "AI Summary", description: "How long to cache PR summaries." },
    { key: "ai_risk_assessment", label: "Risk Assessment", description: "How long to cache risk analyses." },
    { key: "ai_label_suggest", label: "Label Suggestions", description: "How long to cache label suggestions." },
    { key: "ai_reviewer_suggest", label: "Reviewer Suggestions", description: "How long to cache reviewer suggestions." },
    { key: "ai_digest", label: "Weekly Digest", description: "How long to cache digest results." },
    { key: "ai_dependency_detection", label: "Dependency Detection", description: "How long to cache dependency detection." },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Cache TTL</CardTitle>
        <CardDescription>
          How long AI results are cached before being regenerated. Lower values
          mean fresher results but more Codex calls.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <NumberField
            key={item.key}
            label={item.label}
            description={item.description}
            value={(settings.cache.ttlHours as Record<string, number>)[item.key] ?? 24}
            onChange={(v) => updateTtl(item.key, v)}
            min={1}
            max={168}
            step={1}
            suffix="hours"
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SyncSettingsTab({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Sync Interval</CardTitle>
        <CardDescription>
          How frequently the background sync polls GitHub for updated pull
          requests. Minimum is 15 seconds.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <NumberField
          label="Interval"
          value={settings.sync.intervalSeconds}
          onChange={(v) =>
            onChange({
              ...settings,
              sync: { ...settings.sync, intervalSeconds: Math.max(15, v) },
            })
          }
          min={15}
          max={3600}
          step={5}
          suffix="seconds"
        />
      </CardContent>
    </Card>
  );
}

function ScoringSettingsTab({
  settings,
  onChange,
}: {
  settings: AppSettings;
  onChange: (s: AppSettings) => void;
}) {
  const updateWeight = useCallback(
    (key: keyof ScoringWeights, value: number) => {
      onChange({
        ...settings,
        scoring: { ...settings.scoring, [key]: value },
      });
    },
    [settings, onChange],
  );

  const items: { key: keyof ScoringWeights; label: string; description: string }[] = [
    { key: "reviewRequestBoost", label: "Review Request Boost", description: "Points added when you are requested as reviewer." },
    { key: "assigneeBoost", label: "Assignee Boost", description: "Points added when you are assigned to the PR." },
    { key: "ciFailurePenalty", label: "CI Failure Boost", description: "Points added when CI is failing (increases urgency)." },
    { key: "ciPendingPenalty", label: "CI Pending Boost", description: "Points added when CI is pending." },
    { key: "stalenessMaxBoost", label: "Staleness Max Boost", description: "Maximum points added based on how old the PR is." },
    { key: "draftPenalty", label: "Draft Penalty", description: "Points subtracted for draft PRs." },
    { key: "mentionBoostPerMention", label: "Mention Boost (per mention)", description: "Points added per @mention of you." },
    { key: "myLastActivityPenalty", label: "My Last Activity Penalty", description: "Points subtracted if your last activity was most recent." },
  ];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Attention Scoring Weights</CardTitle>
        <CardDescription>
          Fine-tune how urgency scores are calculated for PRs in the triage
          inbox. Higher values increase the weight of each factor.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.map((item) => (
          <NumberField
            key={item.key}
            label={item.label}
            description={item.description}
            value={settings.scoring[item.key]}
            onChange={(v) => updateWeight(item.key, v)}
            min={0}
            max={100}
            step={1}
            suffix="pts"
          />
        ))}
        <Separator className="my-3" />
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...settings,
                scoring: { ...DEFAULT_SCORING_WEIGHTS },
              })
            }
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Reset to defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage({ viewerLabel }: SettingsPageProps) {
  const { theme, toggleTheme } = useTheme();
  const themeLabel = theme === "dark" ? "Light mode" : "Dark mode";
  const { settings, loading, error, saving, save } = useSettings();
  const [signingOut, setSigningOut] = useState(false);
  const [draft, setDraft] = useState<AppSettings | null>(null);

  const current = draft ?? settings;

  const handleChange = useCallback((next: AppSettings) => {
    setDraft(next);
  }, []);

  const handleSave = useCallback(async () => {
    if (!current) return;
    try {
      await save(current);
      setDraft(null);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    }
  }, [current, save]);

  const handleReset = useCallback(() => {
    setDraft({ ...DEFAULT_APP_SETTINGS });
  }, []);

  const isDirty = draft !== null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AppNav
        viewerLabel={viewerLabel}
        themeLabel={themeLabel}
        signingOut={signingOut}
        onToggleTheme={toggleTheme}
        onSignOut={() => {
          setSigningOut(true);
          signOut({ callbackUrl: "/" });
        }}
      />
      <main className="max-w-3xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Configure AI model, caching, sync, and scoring behavior.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isDirty && (
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset all
              </Button>
            )}
            <Button size="sm" disabled={!isDirty || saving} onClick={handleSave}>
              <Save className="h-3.5 w-3.5 mr-1.5" />
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
        {loading && (
          <div className="text-sm text-muted-foreground py-12 text-center">
            Loading settings...
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive py-12 text-center">
            {error}
          </div>
        )}
        {current && !loading && (
          <Tabs defaultValue="ai" className="space-y-6">
            <TabsList>
              <TabsTrigger value="ai">AI Model</TabsTrigger>
              <TabsTrigger value="cache">Cache</TabsTrigger>
              <TabsTrigger value="sync">Sync</TabsTrigger>
              <TabsTrigger value="scoring">Scoring</TabsTrigger>
            </TabsList>
            <TabsContent value="ai">
              <AiSettingsTab settings={current} onChange={handleChange} />
            </TabsContent>
            <TabsContent value="cache">
              <div className="space-y-4">
                <CacheSettingsTab settings={current} onChange={handleChange} />
                <div className="flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => toast.info("Cache clearing is not yet implemented via the UI.")}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Clear AI cache
                  </Button>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="sync">
              <SyncSettingsTab settings={current} onChange={handleChange} />
            </TabsContent>
            <TabsContent value="scoring">
              <ScoringSettingsTab settings={current} onChange={handleChange} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
