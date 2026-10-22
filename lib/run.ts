// Live runs: sends an idea to /api/expand and fills in a Result as the
// streamed pieces arrive. Runs live outside any component, so the Ask page
// can start one, hand off to /result/[id], and the run keeps going even if
// the visitor wanders to another page. Browser-only.

import { useSyncExternalStore } from "react";
import { saveResult, type Result } from "@/lib/history";
import { keyHeaders } from "@/lib/keys";
import type { Purpose } from "@/lib/purposes";
import { STREAM_CONTENT_TYPE, type StreamEvent } from "@/lib/stream";
import type { AnswerLength, Tone } from "@/lib/style";

export type RunInput = { idea: string; purpose: Purpose; length: AnswerLength; tone: Tone };

const runs = new Map<string, Result>(); // every run started in this tab
const controllers = new Map<string, AbortController>(); // only runs still cooking
const listeners = new Set<() => void>();

// Free runs left today. undefined = not asked yet, null = no limits.
let remaining: number | null | undefined;
// True once the server key's daily pool is used up ("free fuel is out").
let fuelOut = false;

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
    ...input,
    status: "cooking",
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

/** True when Brainy's free fuel (the server key's daily pool) is used up. */
export function useFuelOut(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => fuelOut,
    () => false
  );
}

function setRemaining(value: number | null, out?: boolean) {
  remaining = value;
  if (out !== undefined) fuelOut = out;
  emit();
}

/** Ask the server how many runs this visitor has left today. */
export async function refreshRemaining() {
  try {
    const res = await fetch("/api/expand");
    const data = await res.json();
    setRemaining(data.remaining ?? null, Boolean(data.fuelOut));
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
      if (data.remaining !== undefined) setRemaining(data.remaining, data.fuelOut ? true : undefined);
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
          if (event.remaining !== undefined) setRemaining(event.remaining);
          break;
        case "search":
          update(id, () => ({ search: event.search }));
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
          if (event.outOfJuice) setRemaining(remaining ?? null, true);
          update(id, () => ({
            status: "error",
            error: event.error,
            outOfJuice: event.outOfJuice,
            keyProblem: event.keyProblem,
          }));
          break;
        case "done":
          finished = true;
          update(id, () => ({ status: "done" }));
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
