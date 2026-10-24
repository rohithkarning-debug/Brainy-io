// Checks for what the page sends to /api/cross, /api/judge-generation and /api/judge.
// Ideas come from the visitor's own localStorage, so treat them as untrusted:
// keep only the fields this purpose uses, as trimmed, length-capped strings.

import { MAX_IDEA_LENGTH } from "@/lib/limits";
import { MAX_FIELD_LENGTH, type ParentIdea } from "@/lib/lineage";
import type { Version } from "@/lib/openrouter";
import { PURPOSES, SOURCE_LABELS, isPurpose, type Purpose, type SearchSource } from "@/lib/purposes";
import { MAX_GENERATORS } from "@/lib/run-plan";
import type { SearchReport, SearchResult } from "@/lib/search";
import { isLength, isTone, type AnswerLength, type Tone } from "@/lib/style";

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** The shared part of both bodies: the original idea, purpose and answer style. */
export function readBase(body: unknown):
  | { idea: string; purpose: Purpose; length: AnswerLength; tone: Tone }
  | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const idea = text(b.idea, MAX_IDEA_LENGTH);
  if (!idea) return { error: "Missing the original idea." };
  if (!isPurpose(b.purpose)) return { error: "Please pick Startup, Hackathon or Research." };
  return {
    idea,
    purpose: b.purpose,
    length: isLength(b.length) ? b.length : "medium",
    tone: isTone(b.tone) ? b.tone : "simple",
  };
}

/** One idea (a parent, or an offspring to judge), or null if it's unusable. */
export function readIdea(raw: unknown, purpose: Purpose): ParentIdea | null {
  const r = (raw ?? {}) as Record<string, unknown>;
  const title = text(r.title, 200);
  const pitch = text(r.pitch, 600);
  if (!title || !pitch) return null;
  const details = (r.details ?? {}) as Record<string, unknown>;
  return {
    label: text(r.label, 60) ?? "Idea",
    title,
    pitch,
    details: Object.fromEntries(PURPOSES[purpose].fields.map((f) => [f.key, text(details[f.key], MAX_FIELD_LENGTH) ?? ""])),
  };
}

// ---------- Model choices and "Try another judge" (/api/judge) ----------

const MODEL_ID = /^[\w.\-]+\/[\w.:\-]+$/;
const isModelId = (v: unknown): v is string => typeof v === "string" && v.length <= 120 && MODEL_ID.test(v);

/** Generator models ([] = Auto) and the judge ("auto" or an id) the page asked for. */
export function readModelChoice(body: unknown): { models: string[]; judge: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  const models = Array.isArray(b.models) ? b.models.filter(isModelId).slice(0, MAX_GENERATORS) : [];
  return { models, judge: isModelId(b.judge) ? b.judge : "auto" };
}

/** A finished version (a direction or the baseline) to show the judge, or null. */
export function readVersion(raw: unknown, purpose: Purpose): Version | null {
  const idea = readIdea(raw, purpose);
  const r = (raw ?? {}) as Record<string, unknown>;
  const direction = text(r.direction, 60);
  if (!idea || !direction) return null;
  return { title: idea.title, pitch: idea.pitch, details: idea.details, direction, model: text(r.model, 120) ?? "" };
}

const SOURCES = Object.keys(SOURCE_LABELS) as SearchSource[];
const isSource = (v: unknown): v is SearchSource => SOURCES.includes(v as SearchSource);

/**
 * Search results the page kept from the run. Only well-formed http(s) links
 * survive, so the judge (which cites results by number) can't be handed junk.
 */
export function readSearch(raw: unknown): { results: SearchResult[]; report: SearchReport } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const ran = Array.isArray(r.ran) ? [...new Set(r.ran.filter(isSource))] : [];
  const list: unknown[] = Array.isArray(r.results) ? r.results.slice(0, 40) : [];
  const results = list.flatMap((x): SearchResult[] => {
    const o = (x ?? {}) as Record<string, unknown>;
    const title = text(o.title, 300);
    const url = text(o.url, 500);
    if (!isSource(o.source) || !ran.includes(o.source) || !title || !url || !/^https?:\/\//i.test(url)) return [];
    const authors = Array.isArray(o.authors) ? o.authors.filter((a): a is string => typeof a === "string").slice(0, 12) : undefined;
    const year = typeof o.year === "number" && Number.isInteger(o.year) ? o.year : undefined;
    return [{ source: o.source, title, url, snippet: text(o.snippet, 1200) ?? "", ...(authors && { authors }), ...(year && { year }) }];
  });
  return { results, report: { ran, skipped: [] } };
}
