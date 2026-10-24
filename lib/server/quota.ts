// The shared free pool: how many model calls ALL visitors together may make
// on the server's OpenRouter key per day (GLOBAL_DAILY_CALLS, default 45).
// Calls on a visitor's own key never touch it.
//
// A run reserves its estimated calls up front (atomically, so two runs can't
// both take the last few), then each real call uses one up. Fallbacks and
// retries past the reservation take one more each while the pool has any
// left; once it's dry the call is refused and the run keeps what it has.
// Unused reservations go back at the end, so the count is real calls.
//
// When OpenRouter itself says the key hit its daily free-model cap, the pool
// is marked out until midnight UTC, whatever the count says.
//
// Server-only. Without Upstash, there's no pool (limits are off).

import { DEFAULT_GLOBAL_DAILY_CALLS } from "@/lib/limits";
import { OutOfCallsError, isDailyLimitError, type Meter } from "@/lib/openrouter";
import { redis } from "@/lib/ratelimit";
import { noteFailure } from "@/lib/server/health";

export const GLOBAL_DAILY_CALLS =
  Math.max(0, Math.floor(Number(process.env.GLOBAL_DAILY_CALLS))) || DEFAULT_GLOBAL_DAILY_CALLS;

// Counters live under the UTC date, so they reset at midnight UTC on their own.
const day = () => new Date().toISOString().slice(0, 10);
const usedKey = (d: string) => `brainy:calls:${d}`;
const outKey = (d: string) => `brainy:fuelout:${d}`;
const KEEP_SECONDS = 2 * 24 * 60 * 60;

function secondsToMidnightUtc() {
  const now = new Date();
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(60, Math.ceil((midnight - now.getTime()) / 1000));
}

// Without Upstash we can still remember a daily-cap error for this instance.
let memoryOutDay: string | null = null;

export type Pool = { left: number; total: number; out: boolean };

/** Calls left in the shared pool today, or null when limits are off. */
export async function poolStatus(): Promise<Pool | null> {
  if (!redis) return memoryOutDay === day() ? { left: 0, total: GLOBAL_DAILY_CALLS, out: true } : null;
  const d = day();
  const [used, out] = await Promise.all([redis.get<number>(usedKey(d)), redis.get(outKey(d))]);
  const left = out ? 0 : Math.max(0, GLOBAL_DAILY_CALLS - Number(used ?? 0));
  return { left, total: GLOBAL_DAILY_CALLS, out: left === 0 };
}

// Returns calls left after reserving, -1 if there aren't enough, -2 if the pool is marked out.
const RESERVE = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -2 end
local used = tonumber(redis.call('GET', KEYS[1]) or '0')
if used + tonumber(ARGV[1]) > tonumber(ARGV[2]) then return -1 end
local n = redis.call('INCRBY', KEYS[1], ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return tonumber(ARGV[2]) - n`;

export type Reservation =
  | { ok: true; day: string; count: number; left: number | null }
  | { ok: false; out: boolean; left: number };

/** Reserve `count` calls for one request. Throws only if Redis can't be reached. */
export async function reserve(count: number): Promise<Reservation> {
  const d = day();
  if (!redis) {
    return memoryOutDay === d ? { ok: false, out: true, left: 0 } : { ok: true, day: d, count: 0, left: null };
  }
  const result = Number(
    await redis.eval(RESERVE, [usedKey(d), outKey(d)], [String(count), String(GLOBAL_DAILY_CALLS), String(KEEP_SECONDS)])
  );
  if (result === -2) return { ok: false, out: true, left: 0 };
  if (result === -1) {
    const status = await poolStatus();
    const left = status?.left ?? 0;
    return { ok: false, out: left === 0, left };
  }
  return { ok: true, day: d, count, left: result };
}

/** Give back calls that were reserved but never made. */
export async function release(d: string, count: number) {
  if (!redis || count <= 0) return;
  try {
    await redis.decrby(usedKey(d), count);
  } catch (err) {
    console.warn("Could not release reserved calls:", err instanceof Error ? err.message : err);
  }
}

/** OpenRouter says the server key's daily free cap is used up: out until midnight UTC. */
async function markOut() {
  const d = day();
  memoryOutDay = d;
  try {
    await redis?.set(outKey(d), 1, { ex: secondsToMidnightUtc() });
  } catch (err) {
    console.warn("Could not mark the free pool as out:", err instanceof Error ? err.message : err);
  }
}

export type RunMeter = Meter & {
  /** Hand back unused reserved calls and wait for health writes. Call once, at the end. */
  finish(): Promise<void>;
  /** The request failed: hand back EVERY call it took from the pool, used or not. Then call finish(). */
  refund(): Promise<void>;
  /** True once the pool ran dry (or OpenRouter's daily cap hit) during this request. */
  readonly ranDry: boolean;
};

/**
 * Watches one request's calls. `reservation` is null for a visitor's own key:
 * nothing is counted, but model health is still recorded.
 */
export function createMeter(reservation: Extract<Reservation, { ok: true }> | null): RunMeter {
  let reserved = reservation?.count ?? 0;
  let extra = 0; // calls taken from the pool beyond the reservation
  let refunded = false;
  let dry = false;
  const pending: Promise<unknown>[] = [];
  const pooled = reservation !== null && redis !== null;

  return {
    async take() {
      if (reservation === null) return; // own key
      if (dry) throw new OutOfCallsError();
      if (!pooled) return; // limits off
      if (reserved > 0) {
        reserved--;
        return;
      }
      // A fallback or retry beyond the estimate: one more from the pool, if there is one.
      const more = await reserve(1).catch(() => null);
      if (!more?.ok) {
        dry = true;
        throw new OutOfCallsError();
      }
      extra++;
    },
    failed(model, err) {
      pending.push(noteFailure(model, err));
      if (reservation !== null && isDailyLimitError(err)) {
        dry = true;
        pending.push(markOut());
      }
    },
    async finish() {
      if (pooled && reservation && !refunded) await release(reservation.day, reserved);
      reserved = 0;
      await Promise.allSettled(pending);
    },
    async refund() {
      if (!pooled || !reservation || refunded) return;
      refunded = true;
      await release(reservation.day, reservation.count + extra);
    },
    get ranDry() {
      return dry;
    },
  };
}
