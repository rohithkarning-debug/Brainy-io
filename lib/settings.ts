// User settings, kept in localStorage. Browser-only.
// The <head> script in app/layout.tsx reads the same key before the page
// paints, so the theme never flashes; keep SETTINGS_KEY in sync with it.

import { useSyncExternalStore } from "react";
import { createLocalStore } from "@/lib/local-store";
import { MAX_GENERATORS, defaultBaseline, isRunSize, type RunOptions, type RunSize } from "@/lib/run-plan";
import { isLength, isTone, type AnswerLength, type Tone } from "@/lib/style";

export type Theme = "light" | "dark";
export type FontSize = "sm" | "md" | "lg";

export type Settings = {
  theme: Theme;
  length: AnswerLength;
  tone: Tone;
  fontSize: FontSize;
  animations: boolean;
  // Run setup (the Ask page's Advanced panel). null = follow the default.
  runSize: RunSize | null; // null = Quick without your own key, Full with one
  baseline: boolean | null; // null = on for Full, off otherwise
  liveSearch: boolean;
  models: string[]; // generator models; [] = Auto
  judge: string; // "auto" or a model id
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  length: "medium",
  tone: "simple",
  fontSize: "md",
  animations: true,
  runSize: null,
  baseline: null,
  liveSearch: true,
  models: [],
  judge: "auto",
};

export const SETTINGS_KEY = "brainy:settings";

// Keep only valid values, so an old or hand-edited entry can't break the page.
function parse(raw: unknown): Settings {
  const s = (raw ?? {}) as Partial<Record<keyof Settings, unknown>>;
  return {
    theme: s.theme === "dark" ? "dark" : DEFAULT_SETTINGS.theme,
    length: isLength(s.length) ? s.length : DEFAULT_SETTINGS.length,
    tone: isTone(s.tone) ? s.tone : DEFAULT_SETTINGS.tone,
    fontSize: s.fontSize === "sm" || s.fontSize === "lg" ? s.fontSize : DEFAULT_SETTINGS.fontSize,
    animations: typeof s.animations === "boolean" ? s.animations : DEFAULT_SETTINGS.animations,
    runSize: isRunSize(s.runSize) ? s.runSize : null,
    baseline: typeof s.baseline === "boolean" ? s.baseline : null,
    liveSearch: typeof s.liveSearch === "boolean" ? s.liveSearch : DEFAULT_SETTINGS.liveSearch,
    models: Array.isArray(s.models)
      ? [...new Set(s.models.filter((m): m is string => typeof m === "string" && m.length <= 120))].slice(0, MAX_GENERATORS)
      : [],
    judge: typeof s.judge === "string" && s.judge.length <= 120 ? s.judge : DEFAULT_SETTINGS.judge,
  };
}

/** The run setup these settings describe, filling in the defaults for this visitor. */
export function runOptions(s: Settings, ownKey: boolean): RunOptions {
  const size = s.runSize ?? (ownKey ? "full" : "quick");
  return { size, baseline: s.baseline ?? defaultBaseline(size), search: s.liveSearch, models: s.models, judge: s.judge };
}

const store = createLocalStore(SETTINGS_KEY, parse);

export function useSettings(): Settings {
  return useSyncExternalStore(store.subscribe, store.get, () => DEFAULT_SETTINGS);
}

/** Current settings, for event handlers (not for rendering). */
export const getSettings = store.get;

// Cloud sync (lib/sync.ts) hears about every change made in this browser.
let onChange: ((settings: Settings) => void) | null = null;
export function onSettingsChange(listener: ((settings: Settings) => void) | null) {
  onChange = listener;
}

export function updateSettings(patch: Partial<Settings>) {
  store.set({ ...store.get(), ...patch });
  onChange?.(store.get());
}

export function resetSettings() {
  store.set(DEFAULT_SETTINGS);
  onChange?.(DEFAULT_SETTINGS);
}

/** Settings from the cloud copy: checked like stored ones, and not reported back. */
export function applyRemoteSettings(raw: unknown) {
  store.set(parse(raw));
}

// True when the OS asks for less motion.
const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(onChange: () => void) {
  const media = matchMedia(REDUCED_MOTION);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** False when the user turned animations off here or in their OS. */
export function useMotionAllowed(): boolean {
  const { animations } = useSettings();
  const reduced = useSyncExternalStore(subscribeReducedMotion, () => matchMedia(REDUCED_MOTION).matches, () => false);
  return animations && !reduced;
}
