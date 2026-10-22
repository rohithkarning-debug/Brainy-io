"use client";

import type { ReactNode } from "react";
import { useToast } from "@/app/components/Toast";
import { resetSettings, updateSettings, useSettings, type FontSize, type Settings, type Theme } from "@/lib/settings";
import { LENGTHS, LENGTH_KEYS, TONES, TONE_KEYS } from "@/lib/style";

type Choice<T extends string> = { value: T; label: string; hint?: string };

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
        <button
          type="button"
          role="switch"
          aria-checked={settings.animations}
          aria-label="Animations"
          onClick={() => set("animations", !settings.animations)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${settings.animations ? "bg-accent" : "bg-slate-300"}`}
        >
          <span
            className={`absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-card transition-transform ${settings.animations ? "translate-x-5" : ""}`}
          />
        </button>
      </Row>

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

// A row of options built on real radio inputs, so arrow keys and screen readers work out of the box.
function Segmented<T extends string>({
  name,
  legend,
  choices,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {choices.map((c) => {
          const checked = c.value === value;
          return (
            <label
              key={c.value}
              title={c.hint}
              className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                checked ? "bg-surface text-slate-950 shadow-card ring-1 ring-slate-900/5" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={c.value}
                checked={checked}
                onChange={() => onChange(c.value)}
                className="sr-only"
              />
              {c.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
