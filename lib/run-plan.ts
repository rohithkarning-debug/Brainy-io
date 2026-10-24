// How big a run is and which models do the work. Plain code only, so both
// the page (Ask page, estimates) and the API routes (what to actually run)
// can import it.

import { PURPOSES, type Purpose } from "@/lib/purposes";

export type RunSize = "quick" | "standard" | "full";

export const RUN_SIZES: Record<RunSize, { label: string; directions: number; hint: string }> = {
  quick: { label: "Quick", directions: 3, hint: "3 directions" },
  standard: { label: "Standard", directions: 6, hint: "6 directions" },
  full: { label: "Full", directions: 9, hint: "All 9 directions" },
};

export const RUN_SIZE_KEYS = Object.keys(RUN_SIZES) as RunSize[];

export function isRunSize(value: unknown): value is RunSize {
  return typeof value === "string" && value in RUN_SIZES;
}

// Most users pick 1-4 generator models; directions are spread across them.
export const MAX_GENERATORS = 4;
// Auto picks this many healthy free models.
export const AUTO_GENERATORS = 3;

// Without their own key, a run this big gets a warning (it eats a big share of the free pool).
export const WARN_AT_CALLS = 8;

// "auto" or a model id. Generators: an empty list means auto.
export type RunOptions = {
  size: RunSize;
  baseline: boolean;
  search: boolean;
  models: string[];
  judge: string;
};

/** The baseline is on by default only for a Full run. */
export function defaultBaseline(size: RunSize) {
  return size === "full";
}

/**
 * Model calls a run makes when nothing fails: one per direction, the baseline,
 * the search-query writer (Tavily, GitHub and arXiv don't use model calls)
 * and the judge. Fallbacks and retries can add a few more, so it's "~N".
 */
export function estimateCalls({ size, baseline, search }: Pick<RunOptions, "size" | "baseline" | "search">) {
  return RUN_SIZES[size].directions + (baseline ? 1 : 0) + (search ? 1 : 0) + 1;
}

// Which directions a smaller run keeps, most useful first, so even Quick
// pushes the idea three clearly different ways.
const PRIORITY: Record<Purpose, string[]> = {
  startup: [
    "Different customer",
    "B2B",
    "Inverted assumption",
    "Opposite market",
    "Physical",
    "Premium",
    "Consumer",
    "Digital-only",
    "Cheap",
  ],
  hackathon: [
    "AI-powered",
    "Hardware hack",
    "Inverted assumption",
    "Social good",
    "Real-time",
    "Data mashup",
    "Visual wow",
    "Dev tool",
    "Tiny & polished",
  ],
  research: [
    "Quantitative",
    "Different population",
    "Inverted assumption",
    "Qualitative",
    "Benchmark",
    "Cross-disciplinary",
    "Opposite context",
    "Low-cost method",
    "Negative result",
  ],
};

/** The directions a run of this size uses, in the purpose's usual order. */
export function pickDirections(purpose: Purpose, size: RunSize) {
  const keep = new Set(PRIORITY[purpose].slice(0, RUN_SIZES[size].directions));
  return PURPOSES[purpose].directions.filter((d) => keep.has(d.label));
}

/** Spread directions across models: 0,1,2,0,1,2... */
export function roundRobin<T>(count: number, models: T[]): T[] {
  return Array.from({ length: count }, (_, i) => models[i % models.length]);
}

// ---------- The live model list (GET /api/models) ----------

export type ModelHealth = "available" | "busy" | "unavailable";

export type ModelInfo = {
  id: string;
  name: string;
  context: number; // tokens
  free: boolean;
  // USD per million tokens; only on paid models (own-key users only).
  price?: { prompt: number; completion: number };
  health: ModelHealth;
};

/** "$0.15 / $0.60 per M tokens" for a paid model, "Free" otherwise. */
export function priceLabel(m: Pick<ModelInfo, "free" | "price">) {
  if (m.free || !m.price) return "Free";
  const usd = (n: number) => `$${n < 0.01 ? n.toFixed(3) : n < 10 ? n.toFixed(2) : n.toFixed(0)}`;
  return `${usd(m.price.prompt)} in / ${usd(m.price.completion)} out per M`;
}

/** "128k", "1M" */
export function contextLabel(tokens: number) {
  return tokens >= 1_000_000 ? `${Math.round(tokens / 100_000) / 10}M` : `${Math.round(tokens / 1000)}k`;
}
