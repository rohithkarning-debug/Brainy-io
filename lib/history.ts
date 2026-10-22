// Past results, kept in this browser's localStorage. History, Saved and the
// /result/[id] page all read from here. Browser-only.

import { useSyncExternalStore } from "react";
import type { Lineage } from "@/lib/lineage";
import { createLocalStore } from "@/lib/local-store";
import type { BrainyTake, Version } from "@/lib/openrouter";
import type { Purpose } from "@/lib/purposes";
import type { SearchReport } from "@/lib/search";
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
  error?: string;
  limited?: boolean; // the run was refused by the daily limit
  outOfJuice?: boolean; // the server key's free fuel was out (daily pool used up, or every model out of credits)
  keyProblem?: boolean; // the visitor's own key was refused or out of credits
  pinned?: boolean; // shown on the Saved page; survives "Clear history"
  lineage?: Lineage; // ideas bred from this result (see lib/lineage.ts); absent on older results
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

/** Add or replace a result, keeping its pinned flag and bred ideas if it was already saved. */
export function saveResult(result: Result) {
  const list = store.get();
  const before = list.find((r) => r.id === result.id);
  const pinned = before?.pinned ?? result.pinned;
  const lineage = result.lineage ?? before?.lineage;
  let unpinned = 0;
  const rest = list.filter((r) => r.id !== result.id && (hasSaved(r) || ++unpinned < MAX_UNPINNED));
  store.set([{ ...result, pinned, lineage }, ...rest]);
}

/** Change one stored result in place (e.g. add bred ideas). No-op if it isn't stored. */
export function updateResult(id: string, change: (r: Result) => Partial<Result>) {
  store.set(store.get().map((r) => (r.id === id ? { ...r, ...change(r) } : r)));
}

/** A stored result, for event handlers (not for rendering). */
export function getResult(id: string): Result | undefined {
  return store.get().find((r) => r.id === id);
}

export function removeResult(id: string) {
  store.set(store.get().filter((r) => r.id !== id));
}

/** Pin or unpin. Returns the new pinned state. */
export function togglePin(id: string): boolean {
  let pinned = false;
  store.set(
    store.get().map((r) => {
      if (r.id !== id) return r;
      pinned = !r.pinned;
      return { ...r, pinned };
    })
  );
  return pinned;
}

/** Clear history but keep saved results (pinned, or with a saved bred idea). */
export function clearHistory() {
  store.set(store.get().filter(hasSaved));
}
