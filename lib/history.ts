// Past results, kept in this browser's localStorage. History, Saved and the
// /result/[id] page all read from here. Browser-only.

import { useSyncExternalStore } from "react";
import type { Lineage } from "@/lib/lineage";
import { createLocalStore } from "@/lib/local-store";
import type { BrainyTake, Version } from "@/lib/openrouter";
import type { Purpose } from "@/lib/purposes";
import type { SearchReport, SearchResult } from "@/lib/search";
import type { RunPlanInfo } from "@/lib/stream";
import type { AnswerLength, Tone } from "@/lib/style";

// "cooking" only exists while a run is live (see lib/run.ts); stored results
// are "done", or "stopped" / "error" when they only have part of the answer.
export type ResultStatus = "cooking" | "done" | "stopped" | "error";

export type Result = {
  id: string;
  createdAt: number; // ms since epoch
  idea: string;
  purpose: Purpose;
  length: AnswerLength;
  tone: Tone;
  status: ResultStatus;
  baseline: Version | null;
  versions: Version[]; // in the order they finished
  take: BrainyTake | null;
  search: SearchReport | null;
  // What the run did (size, which directions, baseline/search on). Absent on
  // older results, which always ran every direction plus the baseline.
  plan?: RunPlanInfo;
  // The raw search results, kept so "Try another judge" can re-run the verdict. Absent on older results.
  searchResults?: SearchResult[];
  error?: string;
  limited?: boolean; // the run was refused by the daily limit
  outOfJuice?: boolean; // the server key's free fuel was out (daily pool used up, or every model out of credits)
  keyProblem?: boolean; // the visitor's own key was refused or out of credits
  ranDry?: boolean; // the shared free pool ran out mid-run, so some pieces may be missing
  pinned?: boolean; // shown on the Saved page; survives "Clear history"
  lineage?: Lineage; // ideas bred from this result (see lib/lineage.ts); absent on older results
  updatedAt?: number; // ms since epoch, last change in any browser; decides which copy wins in cloud sync
  shareSlug?: string; // set while the result is public at /r/<slug> (cloud sync only; the server decides)
};

/** True if the result, or any idea bred from it, is saved. Saved results survive "Clear history". */
export function hasSaved(r: Result): boolean {
  return Boolean(r.pinned || r.lineage?.offspring?.some((o) => o.saved));
}

// Unpinned results we keep; older ones drop off so localStorage stays small.
const MAX_UNPINNED = 50;

const store = createLocalStore<Result[]>("brainy:history", (raw) =>
  Array.isArray(raw) ? raw.filter((r) => typeof r?.id === "string" && typeof r?.idea === "string") : []
);

/** Every stored result, newest first. `null` until the browser has loaded them. */
export function useHistory(): Result[] | null {
  return useSyncExternalStore(store.subscribe, store.get, () => null);
}

// Cloud sync (lib/sync.ts) listens for changes made here. Only explicit
// changes are reported: dropping old results to keep localStorage small is not
// a delete, so it never removes anything from the cloud copy.
type Change = { upserted: Result[]; removed: string[] };
let onChange: ((change: Change) => void) | null = null;

/** Called with every result this browser adds, changes or deletes. One listener (lib/sync.ts). */
export function onHistoryChange(listener: ((change: Change) => void) | null) {
  onChange = listener;
}

// Keep saved ones and the newest MAX_UNPINNED others, newest first.
function trim(list: Result[]) {
  let unpinned = 0;
  return list.filter((r) => hasSaved(r) || ++unpinned <= MAX_UNPINNED);
}

/** Add or replace a result, keeping its pinned flag and bred ideas if it was already saved. */
export function saveResult(result: Result) {
  const list = store.get();
  const before = list.find((r) => r.id === result.id);
  const pinned = before?.pinned ?? result.pinned;
  const lineage = result.lineage ?? before?.lineage;
  const saved: Result = { ...result, pinned, lineage, updatedAt: Date.now() };
  store.set(trim([saved, ...list.filter((r) => r.id !== result.id)]));
  onChange?.({ upserted: [saved], removed: [] });
}

/** Change one stored result in place (e.g. add bred ideas). No-op if it isn't stored. */
export function updateResult(id: string, change: (r: Result) => Partial<Result>, { silent = false } = {}) {
  let changed: Result | null = null;
  store.set(
    store.get().map((r) => {
      if (r.id !== id) return r;
      changed = { ...r, ...change(r), ...(!silent && { updatedAt: Date.now() }) };
      return changed;
    })
  );
  if (changed && !silent) onChange?.({ upserted: [changed], removed: [] });
}

/** A stored result, for event handlers (not for rendering). */
export function getResult(id: string): Result | undefined {
  return store.get().find((r) => r.id === id);
}

/** Every stored result, for event handlers (not for rendering). */
export function getHistory(): Result[] {
  return store.get();
}

export function removeResult(id: string) {
  store.set(store.get().filter((r) => r.id !== id));
  onChange?.({ upserted: [], removed: [id] });
}

/** Pin or unpin. Returns the new pinned state. */
export function togglePin(id: string): boolean {
  let pinned = false;
  updateResult(id, (r) => {
    pinned = !r.pinned;
    return { pinned };
  });
  return pinned;
}

/** Clear history but keep saved results (pinned, or with a saved bred idea). */
export function clearHistory() {
  const list = store.get();
  store.set(list.filter(hasSaved));
  onChange?.({ upserted: [], removed: list.filter((r) => !hasSaved(r)).map((r) => r.id) });
}

/** Empty this browser's history entirely, saved results too ("Delete my data"). Not reported to sync. */
export function wipeHistory() {
  store.set([]);
}

/**
 * Bring in changes from the cloud copy without reporting them back: results
 * newer than the local copy replace it, and `removed` ids are deleted.
 */
export function mergeRemote(incoming: Result[], removed: string[]) {
  const gone = new Set(removed);
  const byId = new Map(store.get().filter((r) => !gone.has(r.id)).map((r) => [r.id, r]));
  for (const r of incoming) {
    const local = byId.get(r.id);
    if (!local || (r.updatedAt ?? 0) >= (local.updatedAt ?? 0)) byId.set(r.id, r);
  }
  store.set(trim([...byId.values()].sort((a, b) => b.createdAt - a.createdAt)));
}
