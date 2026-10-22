// User settings, kept in localStorage. Browser-only.
// The <head> script in app/layout.tsx reads the same key before the page
// paints, so the theme never flashes; keep SETTINGS_KEY in sync with it.

import { useSyncExternalStore } from "react";
import { createLocalStore } from "@/lib/local-store";
import { isLength, isTone, type AnswerLength, type Tone } from "@/lib/style";

export type Theme = "light" | "dark";
export type FontSize = "sm" | "md" | "lg";

export type Settings = {
  theme: Theme;
  length: AnswerLength;
  tone: Tone;
  fontSize: FontSize;
  animations: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: "light",
  length: "medium",
  tone: "simple",
  fontSize: "md",
  animations: true,
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
  };
}

const store = createLocalStore(SETTINGS_KEY, parse);

export function useSettings(): Settings {
  return useSyncExternalStore(store.subscribe, store.get, () => DEFAULT_SETTINGS);
}

/** Current settings, for event handlers (not for rendering). */
export const getSettings = store.get;

export function updateSettings(patch: Partial<Settings>) {
  store.set({ ...store.get(), ...patch });
}

export function resetSettings() {
  store.set(DEFAULT_SETTINGS);
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
