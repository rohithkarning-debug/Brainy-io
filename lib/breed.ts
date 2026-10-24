// Idea breeding in the browser: cross two ideas, judge a generation, save an
// offspring. Every change is written into the stored result's `lineage`, so
// History and Saved reopen the whole tree. Browser-only.

import { getResult, updateResult, type Result } from "@/lib/history";
import { keyHeaders } from "@/lib/keys";
import {
  EMPTY_LINEAGE,
  MAX_JUDGED,
  findIdea,
  readLineage,
  type GenerationVerdict,
  type Lineage,
  type NodeId,
  type Offspring,
} from "@/lib/lineage";
import type { Version } from "@/lib/openrouter";
import { noteUsage } from "@/lib/run";
import { getSettings } from "@/lib/settings";

/** What went wrong, shaped like a result's notes so the page can reuse them. */
export type BreedError = { error: string; outOfJuice?: boolean; keyProblem?: boolean; limited?: boolean };

const shortId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 8);

function lineageOf(resultId: string): Lineage {
  return readLineage(getResult(resultId)?.lineage ?? EMPTY_LINEAGE);
}

// POST to a breeding route with the visitor's own keys; turns failures into a BreedError.
async function post<T>(url: string, body: unknown): Promise<T | BreedError> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...keyHeaders() },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.remaining !== undefined || data.fuelOut || data.sharedLeft !== undefined) {
        noteUsage(data.remaining, data.fuelOut ? true : undefined, data.sharedLeft);
      }
      return {
        error: data.error ?? `Brainy couldn't answer (HTTP ${res.status}). Please try again.`,
        outOfJuice: Boolean(data.fuelOut),
        keyProblem: Boolean(data.keyProblem),
        limited: Boolean(data.limitReached) && !data.fuelOut,
      };
    }
    if (data.remaining !== undefined) noteUsage(data.remaining);
    return data as T;
  } catch {
    return { error: "Couldn't reach Brainy. Check your connection and try again." };
  }
}

const isError = (x: unknown): x is BreedError => typeof (x as BreedError)?.error === "string";

// An idea as the routes expect it.
const asInput = (label: string, v: Version) => ({ label, title: v.title, pitch: v.pitch, details: v.details });

/** Cross two nodes. Adds 3 offspring to the stored result and returns their ids. */
export async function crossNodes(result: Result, nodeIds: [NodeId, NodeId]): Promise<string[] | BreedError> {
  const lineage = lineageOf(result.id);
  const parents = nodeIds.map((id) => findIdea(result.versions, lineage, id));
  if (parents.some((p) => !p)) return { error: "One of those ideas is gone. Pick two again." };
  const [a, b] = parents as NonNullable<(typeof parents)[number]>[];

  const data = await post<{ offspring: (Version & { inherits: string })[]; model: string }>("/api/cross", {
    idea: result.idea,
    purpose: result.purpose,
    length: result.length,
    tone: result.tone,
    parents: [asInput(a.idea.direction, a.idea), asInput(b.idea.direction, b.idea)],
  });
  if (isError(data)) return data;

  const generation = Math.max(a.generation, b.generation) + 1;
  const now = Date.now();
  const born: Offspring[] = data.offspring.map((o) => ({
    id: shortId(),
    title: o.title,
    pitch: o.pitch,
    details: o.details,
    inherits: o.inherits,
    model: data.model,
    direction: `Gen ${generation}`,
    generation,
    parents: nodeIds,
    createdAt: now,
  }));
  updateResult(result.id, (r) => {
    const l = readLineage(r.lineage);
    return { lineage: { ...l, offspring: [...l.offspring, ...born] } };
  });
  return born.map((o) => o.id);
}

/** Ask the judge about some offspring of one generation. Stores and returns the verdict. */
export async function judgeGeneration(result: Result, generation: number, offspringIds: string[]): Promise<GenerationVerdict | BreedError> {
  const lineage = lineageOf(result.id);
  const judged = offspringIds
    .map((id) => lineage.offspring.find((o) => o.id === id))
    .filter((o): o is Offspring => Boolean(o))
    .slice(0, MAX_JUDGED);
  if (judged.length < 2) return { error: "Judging needs at least two bred ideas." };

  const data = await post<{ pickId: string; why: string; notes: { id: string; note: string }[]; model: string }>(
    "/api/judge-generation",
    {
      idea: result.idea,
      purpose: result.purpose,
      length: result.length,
      tone: result.tone,
      judge: getSettings().judge,
      offspring: judged.map((o) => ({ ...asInput(o.direction, o), id: o.id, inherits: o.inherits })),
    }
  );
  if (isError(data)) return data;

  const verdict: GenerationVerdict = {
    id: shortId(),
    generation,
    offspringIds: judged.map((o) => o.id),
    pickId: data.pickId,
    why: data.why,
    notes: data.notes,
    model: data.model,
    createdAt: Date.now(),
  };
  // One verdict per generation: a new one replaces the old.
  updateResult(result.id, (r) => {
    const l = readLineage(r.lineage);
    return { lineage: { ...l, verdicts: [...l.verdicts.filter((v) => v.generation !== generation), verdict] } };
  });
  return verdict;
}

/** Save or unsave one offspring. Returns the new state. */
export function toggleOffspringSaved(resultId: string, offspringId: string): boolean {
  const saved = !lineageOf(resultId).offspring.find((o) => o.id === offspringId)?.saved;
  updateResult(resultId, (r) => {
    const l = readLineage(r.lineage);
    return { lineage: { ...l, offspring: l.offspring.map((o) => (o.id === offspringId ? { ...o, saved } : o)) } };
  });
  return saved;
}

export { isError as isBreedError };
