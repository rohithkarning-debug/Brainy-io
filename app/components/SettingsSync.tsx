"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/settings";

/**
 * Applies the saved theme, font size and motion setting to <html>, and follows
 * the OS theme when set to "system". The inline script in app/layout.tsx does
 * the same before first paint; this keeps it in sync afterwards.
 */
export function SettingsSync() {
  const { theme, fontSize, animations } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && media.matches);
      root.classList.toggle("dark", dark);
      root.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.font = fontSize;
    document.documentElement.dataset.motion = animations ? "on" : "off";
  }, [fontSize, animations]);

  return null;
}
