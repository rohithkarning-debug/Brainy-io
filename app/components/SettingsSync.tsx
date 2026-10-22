"use client";

import { useEffect } from "react";
import { useSettings } from "@/lib/settings";

/**
 * Applies the saved theme, font size and motion setting to <html>. The inline
 * script in app/layout.tsx does the same before first paint; this keeps it in
 * sync afterwards.
 */
export function SettingsSync() {
  const { theme, fontSize, animations } = useSettings();

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.font = fontSize;
    document.documentElement.dataset.motion = animations ? "on" : "off";
  }, [fontSize, animations]);

  return null;
}
