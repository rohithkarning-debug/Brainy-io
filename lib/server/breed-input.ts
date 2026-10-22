// Checks for what the page sends to /api/cross and /api/judge-generation.
// Ideas come from the visitor's own localStorage, so treat them as untrusted:
// keep only the fields this purpose uses, as trimmed, length-capped strings.

import { MAX_IDEA_LENGTH } from "@/lib/limits";
import { MAX_FIELD_LENGTH, type ParentIdea } from "@/lib/lineage";
import { PURPOSES, isPurpose, type Purpose } from "@/lib/purposes";
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
