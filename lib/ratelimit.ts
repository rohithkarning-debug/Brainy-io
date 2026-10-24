// Daily usage limits, stored in Upstash Redis.
//
// Vercel's serverless functions forget everything between requests, so the
// counters have to live in an outside store. If the Upstash env vars aren't
// set (e.g. local development), limits are switched off and every run is allowed.
//
// Runs on the server's OpenRouter key ("free runs") use two counters: per
// signed-in user (the real limit) and per IP (a looser backup that stops one
// person cycling through many accounts). What the server key can spend in a
// day is capped in model calls, not runs: see lib/server/quota.ts.
// Runs on the visitor's own key only count against a generous per-user cap.
// "Try another judge" re-runs have their own small per-user cap.
//
// Server-only: never import this from the page.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import {
  BYOK_RUNS_PER_USER_PER_DAY,
  REJUDGES_PER_USER_PER_DAY,
  RUNS_PER_IP_PER_DAY,
  RUNS_PER_USER_PER_DAY,
} from "@/lib/limits";

// Prefer the UPSTASH_* names; fall back to the KV_* names that Vercel's
// Upstash integration creates.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

/** The shared Redis client, or null when Upstash isn't configured. */
export const redis = url && token ? new Redis({ url, token }) : null;

// Fixed 1-day windows: counters reset at midnight UTC.
function daily(runs: number, prefix: string) {
  return redis && new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(runs, "1 d"), prefix });
}
const perUser = daily(RUNS_PER_USER_PER_DAY, "brainy:user");
const perIp = daily(RUNS_PER_IP_PER_DAY, "brainy:ip");
const perUserOwnKey = daily(BYOK_RUNS_PER_USER_PER_DAY, "brainy:byok");
const perUserRejudge = daily(REJUDGES_PER_USER_PER_DAY, "brainy:rejudge");

export type Usage = {
  remaining: number | null; // free runs this user has left today; null = limits are off
  // Which limit stopped them, if any.
  blockedBy: "user" | "ip" | "own-key" | "rejudge" | null;
};

// Who is asking: the signed-in user's id plus their IP.
export type Visitor = { userId: string; ip: string };

// The visitor's IP. On Vercel, x-forwarded-for is set by Vercel itself
// (the first entry is the real client), so visitors can't fake it.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Look at the free-run counters without using up a run (for "3 free runs left").
export async function checkUsage({ userId, ip }: Visitor): Promise<Usage> {
  if (!perUser || !perIp) return { remaining: null, blockedBy: null };

  const [mine, here] = await Promise.all([perUser.getRemaining(userId), perIp.getRemaining(ip)]);
  // The IP backup only shows up in the count once it's the tighter limit.
  const remaining = Math.max(0, Math.min(mine.remaining, here.remaining));
  if (mine.remaining <= 0) return { remaining: 0, blockedBy: "user" };
  if (here.remaining <= 0) return { remaining: 0, blockedBy: "ip" };
  return { remaining, blockedBy: null };
}

/**
 * Use up one run. `ownKey` = the visitor sent their own OpenRouter key, so only
 * the anti-abuse cap applies and their free runs are left alone.
 */
export async function consumeRun(visitor: Visitor, { ownKey = false }: { ownKey?: boolean } = {}): Promise<Usage> {
  if (ownKey) {
    if (!perUserOwnKey) return { remaining: null, blockedBy: null };
    const mine = await perUserOwnKey.limit(visitor.userId);
    // `remaining` here is the free-run count, which an own-key run doesn't change: leave it unknown.
    return { remaining: null, blockedBy: mine.success ? null : "own-key" };
  }

  if (!perUser || !perIp) return { remaining: null, blockedBy: null };

  // Check first, so a visitor doesn't lose a run when another limit is already hit.
  const before = await checkUsage(visitor);
  if (before.blockedBy) return before;

  const mine = await perUser.limit(visitor.userId);
  if (!mine.success) return { remaining: 0, blockedBy: "user" };

  const here = await perIp.limit(visitor.ip);
  if (!here.success) return { remaining: 0, blockedBy: "ip" };

  return { remaining: Math.min(mine.remaining, here.remaining), blockedBy: null };
}

/** Use up one "Try another judge" re-run. Leaves the free-run count alone. */
export async function consumeRejudge({ userId }: Visitor): Promise<Usage> {
  if (!perUserRejudge) return { remaining: null, blockedBy: null };
  const mine = await perUserRejudge.limit(userId);
  return { remaining: null, blockedBy: mine.success ? null : "rejudge" };
}
