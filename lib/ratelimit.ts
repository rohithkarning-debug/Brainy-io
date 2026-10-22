// Daily usage limits, stored in Upstash Redis.
//
// Vercel's serverless functions forget everything between requests, so the
// counters have to live in an outside store. If the Upstash env vars aren't
// set (e.g. local development), limits are switched off and every run is allowed.
//
// Three counters: per signed-in user (the real limit), per IP (a looser backup
// that stops one person cycling through many accounts), and one global pool.
//
// Server-only: never import this from the page.

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { GLOBAL_RUNS_PER_DAY, RUNS_PER_IP_PER_DAY, RUNS_PER_USER_PER_DAY } from "@/lib/limits";

// Prefer the UPSTASH_* names; fall back to the KV_* names that Vercel's
// Upstash integration creates.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const redis = url && token ? new Redis({ url, token }) : null;

// Fixed 1-day windows: counters reset at midnight UTC.
function daily(runs: number, prefix: string) {
  return redis && new Ratelimit({ redis, limiter: Ratelimit.fixedWindow(runs, "1 d"), prefix });
}
const perUser = daily(RUNS_PER_USER_PER_DAY, "brainy:user");
const perIp = daily(RUNS_PER_IP_PER_DAY, "brainy:ip");
const everyone = daily(GLOBAL_RUNS_PER_DAY, "brainy:global");

// The single key used for the global counter.
const GLOBAL_KEY = "all";

export type Usage = {
  remaining: number | null; // runs this user has left today; null = limits are off
  blockedBy: "user" | "ip" | "global" | null; // which limit stopped them, if any
};

// Who is asking: the signed-in user's id plus their IP.
export type Visitor = { userId: string; ip: string };

// The visitor's IP. On Vercel, x-forwarded-for is set by Vercel itself
// (the first entry is the real client), so visitors can't fake it.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

// Look at the counters without using up a run (for showing "3 runs left").
export async function checkUsage({ userId, ip }: Visitor): Promise<Usage> {
  if (!perUser || !perIp || !everyone) return { remaining: null, blockedBy: null };

  const [mine, here, all] = await Promise.all([
    perUser.getRemaining(userId),
    perIp.getRemaining(ip),
    everyone.getRemaining(GLOBAL_KEY),
  ]);
  // The IP backup only shows up in the count once it's the tighter limit.
  const remaining = Math.max(0, Math.min(mine.remaining, here.remaining));
  if (mine.remaining <= 0) return { remaining: 0, blockedBy: "user" };
  if (here.remaining <= 0) return { remaining: 0, blockedBy: "ip" };
  if (all.remaining <= 0) return { remaining, blockedBy: "global" };
  return { remaining, blockedBy: null };
}

// Use up one run for this user (and one from the IP and global pools).
export async function consumeRun(visitor: Visitor): Promise<Usage> {
  if (!perUser || !perIp || !everyone) return { remaining: null, blockedBy: null };

  // Check first, so a visitor doesn't lose a run when another limit is already hit.
  const before = await checkUsage(visitor);
  if (before.blockedBy) return before;

  const mine = await perUser.limit(visitor.userId);
  if (!mine.success) return { remaining: 0, blockedBy: "user" };

  const here = await perIp.limit(visitor.ip);
  if (!here.success) return { remaining: 0, blockedBy: "ip" };

  const all = await everyone.limit(GLOBAL_KEY);
  const remaining = Math.min(mine.remaining, here.remaining);
  if (!all.success) return { remaining, blockedBy: "global" };

  return { remaining, blockedBy: null };
}
