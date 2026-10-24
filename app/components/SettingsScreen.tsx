"use client";

import type { ReactNode } from "react";
import { ApiKeys } from "@/app/components/ApiKeys";
import { useToast } from "@/app/components/Toast";
import { Segmented, Switch, type Choice } from "@/app/components/ui";
import { useKeys } from "@/lib/keys";
import { RUN_SIZES, RUN_SIZE_KEYS, estimateCalls } from "@/lib/run-plan";
import {
  resetSettings,
  runOptions,
  updateSettings,
  useSettings,
  type FontSize,
  type Settings,
  type Theme,
} from "@/lib/settings";
import { LENGTHS, LENGTH_KEYS, TONES, TONE_KEYS } from "@/lib/style";

const THEMES: Choice<Theme>[] = [
  { value: "light", label: "Light", hint: "Default" },
  { value: "dark", label: "Dark" },
];

const FONT_SIZES: Choice<FontSize>[] = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Default" },
  { value: "lg", label: "Large" },
];

export function SettingsScreen() {
  const settings = useSettings();
  const toast = useToast();
  const ownKey = Boolean(useKeys().openrouter);
  const run = runOptions(settings, ownKey);

  function set<K extends keyof Settings>(key: K, value: Settings[K]) {
    updateSettings({ [key]: value });
  }

  return (
    <div className="mt-8 max-w-3xl space-y-4">
      <Row title="Theme" description="Brainy is light by default. Results still bloom into colour either way.">
        <Segmented name="theme" legend="Theme" choices={THEMES} value={settings.theme} onChange={(v) => set("theme", v)} />
      </Row>

      <Row title="Answer length" description="How much each field says. Applies to new results.">
        <Segmented
          name="length"
          legend="Answer length"
          choices={LENGTH_KEYS.map((k) => ({ value: k, label: LENGTHS[k].label, hint: LENGTHS[k].hint }))}
          value={settings.length}
          onChange={(v) => set("length", v)}
        />
      </Row>

      <Row title="Tone" description="How the answers sound. Applies to new results.">
        <Segmented
          name="tone"
          legend="Tone"
          choices={TONE_KEYS.map((k) => ({ value: k, label: TONES[k].label, hint: TONES[k].hint }))}
          value={settings.tone}
          onChange={(v) => set("tone", v)}
        />
      </Row>

      <Row title="Font size" description="Scales all text on the site.">
        <Segmented name="font" legend="Font size" choices={FONT_SIZES} value={settings.fontSize} onChange={(v) => set("fontSize", v)} />
      </Row>

      <Row title="Animations" description="Typing effects, fades and the drifting background. Also off when your device asks for reduced motion.">
        <Switch label="Animations" checked={settings.animations} onChange={(v) => set("animations", v)} />
      </Row>

      <Row
        title="Run size"
        description={`How many directions each run cooks. About ${estimateCalls(run)} model requests with these settings. ${
          ownKey ? "Full is the default on your own key." : "Quick is the default on Brainy's shared free requests."
        }`}
      >
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Segmented
            name="run-size"
            legend="Run size"
            choices={RUN_SIZE_KEYS.map((k) => ({ value: k, label: RUN_SIZES[k].label, hint: RUN_SIZES[k].hint }))}
            value={run.size}
            onChange={(v) => updateSettings({ runSize: v, baseline: null })}
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch size="sm" label="Include baseline" checked={run.baseline} onChange={(v) => set("baseline", v)} />
            Include baseline
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch size="sm" label="Live search" checked={run.search} onChange={(v) => set("liveSearch", v)} />
            Live search
          </label>
        </div>
      </Row>

      <ApiKeys />

      <div className="pt-4">
        <button
          type="button"
          onClick={() => {
            resetSettings();
            toast("Settings reset");
          }}
          className="text-sm font-medium text-slate-500 hover:text-slate-900"
        >
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="max-w-xs">
        <h2 className="font-semibold tracking-tight text-slate-950">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      {children}
    </section>
  );
}
