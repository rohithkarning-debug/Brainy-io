// Daily usage limits, stored in Upstash Redis.
//
// Vercel's serverless functions forget everything between requests, so the
// counters have to live in an outside store. If the Upstash env vars aren't
// set (e.g. local development), limits are switched off and every run is allowed.
//
// Server-only: never import this from the page.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { GLOBAL_RUNS_PER_DAY, RUNS_PER_IP_PER_DAY } from "@/lib/limits";

// Redis.fromEnv() reads UPSTASH_REDIS_REST_URL / _TOKEN, or the KV_REST_API_URL /
// _TOKEN names that Vercel's Upstash integration creates. Check for the same pair.
const configured = Boolean(
  (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) &&
    (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)
);

const redis = configured ? Redis.fromEnv() : null;

// Fixed 1-day windows: counters reset at midnight UTC.
const perIp =
  redis &&
  new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(RUNS_PER_IP_PER_DAY, "1 d"), prefix: "brainy:ip" });
const everyone =
  redis &&
  new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(GLOBAL_RUNS_PER_DAY, "1 d"), prefix: "brainy:global" });

// The single key used for the global counter.
const GLOBAL_KEY = "all";

export type Usage = {
  remaining: number | null; // runs this visitor has left today; null = limits are off
  blockedBy: "ip" | "global" | null; // which limit stopped them, if any
};

// The visitor's IP. On Vercel, x-forwarded-for is set by Vercel itself
// (the first entry is the real client), so visitors can't fake it.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Look at the counters without using up a run (for showing "3 runs left").
export async function checkUsage(ip: string): Promise<Usage> {
  if (!perIp || !everyone) return { remaining: null, blockedBy: null };

  const [mine, all] = await Promise.all([perIp.getRemaining(ip), everyone.getRemaining(GLOBAL_KEY)]);
  if (mine.remaining <= 0) return { remaining: 0, blockedBy: "ip" };
  if (all.remaining <= 0) return { remaining: mine.remaining, blockedBy: "global" };
  return { remaining: mine.remaining, blockedBy: null };
}

// Use up one run for this visitor (and one from the global pool).
export async function consumeRun(ip: string): Promise<Usage> {
  if (!perIp || !everyone) return { remaining: null, blockedBy: null };

  // Check first, so a visitor doesn't lose a run when the global cap is already hit.
  const before = await checkUsage(ip);
  if (before.blockedBy) return before;

  const mine = await perIp.limit(ip);
  if (!mine.success) return { remaining: 0, blockedBy: "ip" };

  const all = await everyone.limit(GLOBAL_KEY);
  if (!all.success) return { remaining: mine.remaining, blockedBy: "global" };

  return { remaining: mine.remaining, blockedBy: null };
}
