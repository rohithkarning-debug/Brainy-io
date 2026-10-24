// Which models do the work, chosen per request from the live model list
// (lib/server/catalog.ts) and current model health (lib/server/health.ts).
//
// The server's own key is free-only: runs on it only ever use free models,
// whatever the page asks for. A visitor's own key may also pick paid models.
// Server-only (reads env vars).

import { getCatalog } from "@/lib/server/catalog";
import { getDenied, getHealth } from "@/lib/server/health";
import { AUTO_GENERATORS, MAX_GENERATORS, type ModelInfo } from "@/lib/run-plan";

// Free models known to follow the JSON shapes well go first in Auto; the
// rest follow by context size. Anything not in the live list is skipped.
const PREFERRED_GENERATORS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];
const PREFERRED_JUDGES = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
];

// Optional: put this model first in the Auto judge chain. Only honoured when
// it's a free model in the live list, since the server key is free-only.
const ENV_JUDGE = process.env.JUDGE_MODEL?.trim();

// Each call tries at most this many models (its own plus fallbacks), so one
// failing direction can't eat the shared pool.
const CHAIN_LENGTH = 3;

/**
 * Every usable model with its health. Paid models only when asked for
 * (own-key users). Denylisted models (lib/server/health.ts) are left out, so
 * neither the pickers nor any fallback chain ever offers them.
 */
export async function modelList({ paid = false }: { paid?: boolean } = {}): Promise<ModelInfo[]> {
  const [catalog, health, denied] = await Promise.all([getCatalog(), getHealth(), getDenied()]);
  return catalog
    .filter((m) => (paid || m.free) && !denied.has(m.id))
    .map((m) => ({ ...m, health: health[m.id] ?? "available" }));
}

// Preferred ids first (in their order), then the rest by context size, biggest first.
function rank(models: ModelInfo[], preferred: string[]) {
  const at = (id: string) => {
    const i = preferred.indexOf(id);
    return i === -1 ? preferred.length : i;
  };
  return [...models].sort((a, b) => at(a.id) - at(b.id) || b.context - a.context);
}

// Healthy ones; if every model is flagged, the busy ones (then any), since trying beats failing outright.
function healthyFirst(models: ModelInfo[]) {
  const healthy = models.filter((m) => m.health === "available");
  const busy = models.filter((m) => m.health === "busy");
  return (healthy.length > 0 ? healthy : busy.length > 0 ? busy : models).map((m) => m.id);
}

export type Lineup = {
  generators: string[]; // directions are spread across these, round-robin
  fallbacks: string[]; // healthy free models any call can fall back to
  judges: string[]; // the judge chain, first choice first
};

/**
 * The models for one request. `models` (generators) and `judge` come from the
 * page: [] / "auto" = Auto. Unknown, unavailable or (on the server key) paid
 * picks are dropped, falling back to Auto.
 */
export async function lineup({
  ownKey,
  models = [],
  judge = "auto",
}: {
  ownKey: boolean;
  models?: string[];
  judge?: string;
}): Promise<Lineup> {
  const list = await modelList({ paid: ownKey });
  const byId = new Map(list.map((m) => [m.id, m]));
  const usable = (id: string) => {
    const m = byId.get(id);
    return Boolean(m && m.health !== "unavailable" && (m.free || ownKey));
  };

  const free = list.filter((m) => m.free);
  const fallbacks = healthyFirst(rank(free, PREFERRED_GENERATORS));

  const picked = [...new Set(models)].filter(usable).slice(0, MAX_GENERATORS);
  const generators = picked.length > 0 ? picked : fallbacks.slice(0, AUTO_GENERATORS);

  const envJudge = ENV_JUDGE && byId.get(ENV_JUDGE)?.free ? [ENV_JUDGE] : [];
  const autoJudges = healthyFirst(rank(free, [...envJudge, ...PREFERRED_JUDGES]));
  const judges = judge !== "auto" && usable(judge) ? [judge, ...autoJudges.filter((j) => j !== judge)] : autoJudges;

  return { generators, fallbacks, judges: judges.slice(0, CHAIN_LENGTH) };
}

/**
 * One call's model chain: its own model, then healthy free fallbacks.
 * `offset` rotates where the fallbacks start, so parallel calls don't all
 * land on the same free model and hit its rate limit.
 */
export function chainFor(model: string, fallbacks: string[], offset = 0): string[] {
  const rest = fallbacks.filter((m) => m !== model);
  const start = rest.length > 0 ? offset % rest.length : 0;
  return [model, ...rest.slice(start), ...rest.slice(0, start)].slice(0, CHAIN_LENGTH);
}
