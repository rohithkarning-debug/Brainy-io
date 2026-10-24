// Model health, shared by every visitor: a model that just answered 429, 5xx
// or timed out is "busy" for 10 minutes; one that answered 404 (no longer
// offered) or 403 (refuses apps like ours) is "unavailable" for an hour.
// Auto picks and fallback chains skip both. Stored in one Upstash hash
// (model id -> "status:expiresAt"), or in memory when Upstash isn't
// configured. Server-only.

import { httpStatus, isAuthError, isKeyLimitError } from "@/lib/openrouter";
import { redis } from "@/lib/ratelimit";
import type { ModelHealth } from "@/lib/run-plan";

const HASH_KEY = "brainy:health";
const BUSY_MS = 10 * 60 * 1000;
const DOWN_MS = 60 * 60 * 1000;

const memory = new Map<string, string>();

// Models OpenRouter refuses to serve to apps like ours at all ("only available
// on agentic harnesses"). Kept in their own hash, with no expiry on the key, so
// they're dropped from the model list for DENY_MS and never tried meanwhile.
const DENY_KEY = "brainy:denied";
const DENY_MS = 30 * 24 * 60 * 60 * 1000;
const AGENTIC_ONLY = /only available on agentic harness/i;
const deniedMemory = new Map<string, number>();

/** Model ids on the denylist right now. Never throws. */
export async function getDenied(): Promise<Set<string>> {
  try {
    const raw = redis ? await redis.hgetall<Record<string, unknown>>(DENY_KEY) : Object.fromEntries(deniedMemory);
    return new Set(Object.entries(raw ?? {}).filter(([, until]) => Number(until) > Date.now()).map(([id]) => id));
  } catch (err) {
    console.warn("Model denylist read failed:", err instanceof Error ? err.message : err);
    return new Set();
  }
}

async function deny(model: string) {
  const until = Date.now() + DENY_MS;
  if (!redis) {
    deniedMemory.set(model, until);
    return;
  }
  try {
    await redis.hset(DENY_KEY, { [model]: until });
  } catch (err) {
    console.warn("Model denylist write failed:", err instanceof Error ? err.message : err);
  }
}

type Flag = { status: Exclude<ModelHealth, "available">; until: number };

function parse(value: unknown): Flag | null {
  const [status, until] = String(value ?? "").split(":");
  const ms = Number(until);
  if ((status !== "busy" && status !== "unavailable") || !(ms > Date.now())) return null;
  return { status, until: ms };
}

/** Health of every model with a live flag; anything missing is "available". Never throws. */
export async function getHealth(): Promise<Record<string, ModelHealth>> {
  let raw: Record<string, unknown> | null = null;
  try {
    raw = redis ? await redis.hgetall<Record<string, unknown>>(HASH_KEY) : Object.fromEntries(memory);
  } catch (err) {
    console.warn("Model health read failed:", err instanceof Error ? err.message : err);
  }
  const out: Record<string, ModelHealth> = {};
  for (const [id, value] of Object.entries(raw ?? {})) {
    const flag = parse(value);
    if (flag) out[id] = flag.status;
  }
  return out;
}

async function mark(model: string, status: Flag["status"], ms: number) {
  const value = `${status}:${Date.now() + ms}`;
  if (!redis) {
    memory.set(model, value);
    return;
  }
  try {
    await redis.hset(HASH_KEY, { [model]: value });
    // Stale fields are ignored on read; this just stops the hash living forever.
    await redis.expire(HASH_KEY, 24 * 60 * 60);
  } catch (err) {
    console.warn("Model health write failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Record a failed call. Only failures that say something about the MODEL
 * count: a refused key, a key-wide free-model cap or a cancelled call don't.
 */
export function noteFailure(model: string, err: unknown): Promise<void> {
  if (isAuthError(err) || isKeyLimitError(err)) return Promise.resolve();
  const status = httpStatus(err);
  if (status === 403 && err instanceof Error && AGENTIC_ONLY.test(err.message)) return deny(model);
  const timedOut = err instanceof Error && err.name === "TimeoutError";
  // 404: no longer offered. 403: refused for every request like ours (e.g. a
  // free model OpenRouter now limits to "agentic harnesses"); a moderation
  // 403 is about the input, not the model, so it doesn't count.
  const moderated = err instanceof Error && /moderation|flagged/i.test(err.message);
  if (status === 404 || (status === 403 && !moderated)) return mark(model, "unavailable", DOWN_MS);
  if (timedOut || status === 429 || (status !== null && status >= 500)) return mark(model, "busy", BUSY_MS);
  return Promise.resolve();
}
