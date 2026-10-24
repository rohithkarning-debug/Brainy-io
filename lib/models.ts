// The live model list for the pickers, from GET /api/models. Loaded once per
// tab and refreshed when it's a minute old, so health dots stay current
// without asking on every render. Browser-only.

import { useEffect, useSyncExternalStore } from "react";
import type { ModelInfo } from "@/lib/run-plan";

type State = { paid: boolean; models: ModelInfo[]; at: number } | null;

let state: State = null;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const FRESH_MS = 60_000;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function load(paid: boolean) {
  if (state && state.paid === paid && Date.now() - state.at < FRESH_MS) return;
  if (loading) {
    // Another load is running (maybe for the other list): wait, then check again.
    await loading;
    if (state?.paid === paid) return;
  }
  loading = (async () => {
    try {
      const res = await fetch(`/api/models${paid ? "?paid=1" : ""}`);
      const data = await res.json();
      if (Array.isArray(data?.models)) {
        state = { paid, models: data.models, at: Date.now() };
        listeners.forEach((l) => l());
      }
    } catch {
      // The pickers fall back to "Auto" alone.
    } finally {
      loading = null;
    }
  })();
  return loading;
}

/**
 * Usable models with their health, free first. `paid` adds paid models
 * (own-key users). null while loading or if the list couldn't be fetched.
 */
export function useModels(paid: boolean): ModelInfo[] | null {
  useEffect(() => {
    void load(paid);
  }, [paid]);
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => null
  );
  if (!current) return null;
  return paid ? current.models : current.models.filter((m) => m.free);
}
