// Live runs: sends an idea to /api/expand and fills in a Result as the
// streamed pieces arrive. Runs live outside any component, so the Ask page
// can start one, hand off to /result/[id], and the run keeps going even if
// the visitor wanders to another page. Browser-only.

import { useSyncExternalStore } from "react";
import { getResult, saveResult, updateResult, type Result } from "@/lib/history";
import { keyHeaders } from "@/lib/keys";
import type { BrainyTake } from "@/lib/openrouter";
import type { Purpose } from "@/lib/purposes";
import { pickDirections, type RunOptions } from "@/lib/run-plan";
import { STREAM_CONTENT_TYPE, type StreamEvent } from "@/lib/stream";
import type { AnswerLength, Tone } from "@/lib/style";

export type RunInput = { idea: string; purpose: Purpose; length: AnswerLength; tone: Tone } & RunOptions;

const runs = new Map<string, Result>(); // every run started in this tab
const controllers = new Map<string, AbortController>(); // only runs still cooking
const listeners = new Set<() => void>();

// Free runs left today. undefined = not asked yet, null = no limits.
let remaining: number | null | undefined;
// True once the shared free pool is used up ("free fuel is out").
let fuelOut = false;
// Shared free model calls left today. undefined = not asked yet, null = no limits.
let sharedLeft: number | null | undefined;

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Replace (never mutate) the result so useSyncExternalStore sees the change.
function update(id: string, change: (r: Result) => Partial<Result>) {
  const current = runs.get(id);
  if (!current) return;
  runs.set(id, { ...current, ...change(current) });
  emit();
}

function newId() {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

/** Start a run and return its id right away; results stream in afterwards. */
export function startRun(input: RunInput): string {
  const id = newId();
  runs.set(id, {
    id,
    createdAt: Date.now(),
    idea: input.idea,
    purpose: input.purpose,
    length: input.length,
    tone: input.tone,
    status: "cooking",
    // The server confirms this (and which models run) in its "start" event.
    plan: {
      size: input.size,
      directions: pickDirections(input.purpose, input.size).map((d) => d.label),
      baseline: input.baseline,
      search: input.search,
      generators: [],
    },
    baseline: null,
    versions: [],
    take: null,
    search: null,
  });
  emit();
  void execute(id, input);
  return id;
}

/** Stop a run. Whatever has arrived so far is kept. */
export function stopRun(id: string) {
  controllers.get(id)?.abort();
}

/** The live run with this id, or null if it wasn't started in this tab. */
export function useRun(id: string): Result | null {
  return useSyncExternalStore(
    subscribe,
    () => runs.get(id) ?? null,
    () => null
  );
}

/** Runs left today: undefined while unknown, null when there are no limits. */
export function useRemaining(): number | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => remaining,
    () => undefined
  );
}

/** Shared free model calls left today: undefined while unknown, null when there are no limits. */
export function useSharedLeft(): number | null | undefined {
  return useSyncExternalStore(
    subscribe,
    () => sharedLeft,
    () => undefined
  );
}

/** True when Brainy's free fuel (the shared daily pool) is used up. */
export function useFuelOut(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fuelOut,
    () => false
  );
}

/** Record a free-run count (and fuel state) reported by another route, e.g. /api/cross. */
export function noteUsage(value: number | null | undefined, out?: boolean, shared?: number | null) {
  setRemaining(value === undefined ? (remaining ?? null) : value, out, shared);
}

function setRemaining(value: number | null, out?: boolean, shared?: number | null) {
  remaining = value;
  if (out !== undefined) fuelOut = out;
  if (shared !== undefined) sharedLeft = shared;
  emit();
}

/** Ask the server how many runs this visitor has left today. */
export async function refreshRemaining() {
  try {
    const res = await fetch("/api/expand", { cache: "no-store" });
    const data = await res.json();
    setRemaining(data.remaining ?? null, Boolean(data.fuelOut), data.sharedLeft ?? null);
  } catch {
    // Not important enough to show an error.
  }
}

async function execute(id: string, input: RunInput) {
  const controller = new AbortController();
  controllers.set(id, controller);
  let finished = false; // got "done" or a server "error" event

  try {
    const res = await fetch("/api/expand", {
      method: "POST",
      // The visitor's own keys, if any, ride along in headers (see lib/keys.ts).
      headers: { "Content-Type": "application/json", ...keyHeaders() },
      body: JSON.stringify(input),
      signal: controller.signal,
    });

    // Bad input and hit limits come back as plain JSON, not a stream.
    if (!res.headers.get("content-type")?.includes(STREAM_CONTENT_TYPE) || !res.body) {
      const data = await res.json().catch(() => ({}));
      if (data.remaining !== undefined || data.sharedLeft !== undefined) {
        setRemaining(data.remaining ?? remaining ?? null, data.fuelOut ? true : undefined, data.sharedLeft);
      }
      update(id, () => ({
        status: "error",
        error: data.error ?? `Brainy couldn't answer (HTTP ${res.status}). Please try again.`,
        limited: Boolean(data.limitReached) && !data.fuelOut,
        outOfJuice: Boolean(data.fuelOut),
        keyProblem: Boolean(data.keyProblem),
      }));
      return;
    }

    for await (const event of readEvents(res.body)) {
      switch (event.type) {
        case "start":
          if (event.remaining !== undefined) setRemaining(event.remaining, undefined, event.sharedLeft);
          update(id, () => ({ plan: event.plan }));
          break;
        case "search":
          update(id, () => ({ search: event.search, searchResults: event.results }));
          break;
        case "baseline":
          update(id, () => ({ baseline: event.version }));
          break;
        case "version":
          update(id, (r) => ({ versions: [...r.versions, event.version] }));
          break;
        case "take":
          update(id, () => ({ take: event.take }));
          break;
        case "error":
          finished = true;
          // A failed run is given back, so the count is the refunded one.
          if (event.remaining !== undefined || event.outOfJuice) {
            setRemaining(event.remaining !== undefined ? event.remaining : (remaining ?? null), event.outOfJuice || undefined);
          }
          update(id, () => ({
            status: "error",
            error: event.error,
            outOfJuice: event.outOfJuice,
            keyProblem: event.keyProblem,
          }));
          break;
        case "done":
          finished = true;
          if (event.sharedLeft !== undefined) setRemaining(remaining ?? null, event.fuelOut || undefined, event.sharedLeft);
          update(id, () => ({ status: "done", ...(event.fuelOut && { ranDry: true }) }));
          break;
      }
    }
    if (!finished) throw new Error("dropped");
  } catch (err) {
    if (controller.signal.aborted) {
      update(id, () => ({ status: "stopped" }));
    } else {
      console.warn("Run failed:", err);
      const offline = err instanceof TypeError; // fetch's network error
      update(id, () => ({
        status: "error",
        error: offline
          ? "Couldn't reach Brainy. Check your connection and try again."
          : "The connection dropped before Brainy finished. Please try again.",
      }));
    }
  } finally {
    controllers.delete(id);
    // Keep anything with content; a run that produced nothing isn't worth a history entry.
    const result = runs.get(id);
    if (result && (result.baseline || result.versions.length > 0 || result.take)) saveResult(result);
  }
}

// Split the response body into lines and parse each one as an event.
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }); // stream: keeps multi-byte characters split across chunks intact
    let newline: number;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as StreamEvent;
    }
  }
}

/**
 * "Try another judge": re-run only Brainy's Take on a finished result's
 * directions and kept search results. Doesn't use up a run. Stores the new
 * verdict and returns null, or returns what went wrong.
 */
export async function rejudge(id: string, judge: string): Promise<{ error: string; outOfJuice?: boolean } | null> {
  const result = runs.get(id) ?? getResult(id);
  if (!result) return { error: "This result is gone." };
  try {
    const res = await fetch("/api/judge", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeaders() },
      body: JSON.stringify({
        idea: result.idea,
        purpose: result.purpose,
        length: result.length,
        tone: result.tone,
        judge,
        versions: result.baseline ? [result.baseline, ...result.versions] : result.versions,
        search: { ran: result.search?.ran ?? [], results: result.searchResults ?? [] },
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data.sharedLeft !== undefined || data.fuelOut) {
      setRemaining(remaining ?? null, data.fuelOut ? true : undefined, data.sharedLeft);
    }
    if (!res.ok || !data.take) {
      return { error: data.error ?? `Brainy couldn't answer (HTTP ${res.status}). Please try again.`, outOfJuice: Boolean(data.fuelOut) };
    }
    const take = data.take as BrainyTake;
    // The live copy (if this tab ran it) and the stored one both get the verdict.
    update(id, () => ({ take }));
    updateResult(id, () => ({ take }));
    return null;
  } catch {
    return { error: "Couldn't reach Brainy. Check your connection and try again." };
  }
}
