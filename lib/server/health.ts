// Model health, shared by every visitor: a model that just answered 429, 5xx
// or timed out is "busy" for 10 minutes; one that answered 404 (no longer
// offered) is "unavailable" for an hour. Auto picks and fallback chains skip
// both. Stored in one Upstash hash (model id -> "status:expiresAt"), or in
// memory when Upstash isn't configured. Server-only.

import { httpStatus, isAuthError, isKeyLimitError } from "@/lib/openrouter";
import { redis } from "@/lib/ratelimit";
import type { ModelHealth } from "@/lib/run-plan";

const HASH_KEY = "brainy:health";
const BUSY_MS = 10 * 60 * 1000;
const DOWN_MS = 60 * 60 * 1000;

const memory = new Map<string, string>();

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
  const timedOut = err instanceof Error && err.name === "TimeoutError";
  if (status === 404) return mark(model, "unavailable", DOWN_MS);
  if (timedOut || status === 429 || (status !== null && status >= 500)) return mark(model, "busy", BUSY_MS);
  return Promise.resolve();
}
