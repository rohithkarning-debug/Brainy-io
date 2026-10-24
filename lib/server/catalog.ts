// The live list of OpenRouter models, from its public models API
// (https://openrouter.ai/docs/api-reference/list-available-models).
// Fetched server-side and cached for an hour in Upstash (or in memory when
// Upstash isn't configured), so pickers never wait on OpenRouter.
// Server-only.

import { FREE_MODELS } from "@/lib/openrouter";
import { redis } from "@/lib/ratelimit";

export type CatalogModel = {
  id: string;
  name: string;
  context: number;
  free: boolean;
  price?: { prompt: number; completion: number }; // USD per million tokens, paid models only
};

const MODELS_URL = "https://openrouter.ai/api/v1/models";
const CACHE_KEY = "brainy:catalog:v1";
const CACHE_SECONDS = 60 * 60;
const TIMEOUT_MS = 8_000;

// Below this a model can't hold the judge's prompt (every version plus search results).
const MIN_CONTEXT = 32_000;
// Free models smaller than this (by the "NNb" in their id) tend to break the JSON shape.
const MIN_PARAMS_B = 12;
// Free models built for something else: safety classifiers, code-only or tiny variants.
const WEAK = /(safety|guard|moderat|embed|rerank|code|coder|nano|tiny|\bxs\b|-xs-)/i;

type RawModel = {
  id?: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { output_modalities?: string[] };
  expiration_date?: string | null;
};

let memory: { at: number; models: CatalogModel[] } | null = null;

// Total parameters in billions from an id like "gemma-4-31b-it" or "...-120b-a12b"
// (the first number is the total). null when the id doesn't say.
function paramsB(id: string): number | null {
  const m = id.match(/(\d+(?:\.\d+)?)b(?![a-z])/i);
  return m ? Number(m[1]) : null;
}

/** Keep text models with enough context; free ones must also look strong enough. */
export function toCatalog(raw: RawModel[]): CatalogModel[] {
  const now = Date.now();
  const out: CatalogModel[] = [];
  for (const m of raw) {
    if (typeof m.id !== "string" || !m.id.includes("/")) continue;
    if (!(m.architecture?.output_modalities ?? ["text"]).includes("text")) continue;
    if ((m.context_length ?? 0) < MIN_CONTEXT) continue;
    if (m.expiration_date && Date.parse(m.expiration_date) < now) continue;
    const prompt = Number(m.pricing?.prompt);
    const completion = Number(m.pricing?.completion);
    // Routers and variable-priced models report negative or missing prices.
    if (!Number.isFinite(prompt) || !Number.isFinite(completion) || prompt < 0 || completion < 0) continue;

    const free = m.id.endsWith(":free") && prompt === 0 && completion === 0;
    if (free) {
      const size = paramsB(m.id);
      if ((size !== null && size < MIN_PARAMS_B) || WEAK.test(m.id)) continue;
    } else if (m.id.endsWith(":free") || prompt + completion === 0) {
      continue; // a ":free" id that isn't really free, or a 0-priced id we can't vouch for
    }
    out.push({
      id: m.id,
      name: (m.name ?? m.id).replace(/\s*\(free\)\s*$/i, ""),
      context: m.context_length ?? 0,
      free,
      ...(!free && { price: { prompt: prompt * 1e6, completion: completion * 1e6 } }),
    });
  }
  return out;
}

// What we use when OpenRouter's list can't be reached and nothing is cached.
const FALLBACK: CatalogModel[] = FREE_MODELS.map((id) => ({ id, name: id, context: 128_000, free: true }));

/** Every usable model, free and paid. Never throws. */
export async function getCatalog(): Promise<CatalogModel[]> {
  if (memory && Date.now() - memory.at < CACHE_SECONDS * 1000) return memory.models;
  try {
    const cached = redis ? await redis.get<CatalogModel[]>(CACHE_KEY) : null;
    if (Array.isArray(cached) && cached.length > 0) {
      memory = { at: Date.now(), models: cached };
      return cached;
    }
  } catch (err) {
    console.warn("Model list cache read failed:", err instanceof Error ? err.message : err);
  }

  try {
    const res = await fetch(MODELS_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const models = toCatalog(Array.isArray(data?.data) ? data.data : []);
    if (!models.some((m) => m.free)) throw new Error("no usable free models in the list");
    memory = { at: Date.now(), models };
    await redis?.set(CACHE_KEY, models, { ex: CACHE_SECONDS }).catch(() => {});
    return models;
  } catch (err) {
    console.warn("Could not load the model list:", err instanceof Error ? err.message : err);
    // Keep whatever we had (or the fallback) and try OpenRouter again in 5 minutes.
    const models = memory?.models ?? FALLBACK;
    memory = { at: Date.now() - (CACHE_SECONDS - 5 * 60) * 1000, models };
    return models;
  }
}
