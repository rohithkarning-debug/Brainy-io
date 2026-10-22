// Shared checks for every route that spends model calls (/api/expand,
// /api/cross, /api/judge-generation): sign-in, the visitor's own keys, daily
// limits, and turning model failures into friendly messages. Server-only.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { KEY_HEADERS, isValidKey, type KeyProvider } from "@/lib/key-format";
import { BYOK_RUNS_PER_USER_PER_DAY, RUNS_PER_USER_PER_DAY } from "@/lib/limits";
import { isAuthError, isQuotaError } from "@/lib/openrouter";
import { consumeRun, getClientIp, type Usage, type Visitor } from "@/lib/ratelimit";

// Shown for any server-side problem. Details go to the logs, never to visitors.
export const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

// The server key's daily pool is used up, or every model on it is out of credits.
export const FUEL_OUT = "Brainy's free fuel is out for today. Add your own free OpenRouter key to keep going.";

// Shown if Redis is configured but can't be reached. We refuse the run
// rather than risk unlimited use of the API credits.
const LIMITS_DOWN = "Brainy can't check usage limits right now. Please try again in a minute.";

const KEY_REJECTED =
  "Your OpenRouter key was rejected. Check it in Settings, or remove it to use Brainy's free runs.";
const KEY_EMPTY =
  "Your OpenRouter key is out of credits or rate-limited right now. Check it on openrouter.ai, or remove it in Settings to use Brainy's free runs.";

// The visitor's own keys for this request. Never stored, logged or echoed back.
export type UserKeys = Partial<Record<KeyProvider, string>>;

export type Caller = { visitor: Visitor; keys: UserKeys; ownKey: boolean };

// Friendly message for each limit (shown as-is in the UI).
function limitMessage(blockedBy: NonNullable<Usage["blockedBy"]>) {
  if (blockedBy === "user")
    return `You've used your ${RUNS_PER_USER_PER_DAY} free runs today. Add your own free OpenRouter key to keep going, or come back tomorrow.`;
  if (blockedBy === "ip")
    return "Too many free runs from this network today. Add your own free OpenRouter key to keep going, or come back tomorrow.";
  if (blockedBy === "own-key") return `You've hit today's cap of ${BYOK_RUNS_PER_USER_PER_DAY} runs on your own key. Come back tomorrow!`;
  return FUEL_OUT;
}

// The signed-in user and their IP, or null when signed out.
export async function getVisitor(req: Request): Promise<Visitor | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return userId ? { userId, ip: getClientIp(req) } : null;
}

/**
 * Who is calling and with which keys. Returns a ready error response when
 * they're signed out (401) or sent a malformed key (400).
 */
export async function identify(req: Request): Promise<Caller | NextResponse> {
  const visitor = await getVisitor(req);
  if (!visitor) return NextResponse.json({ error: "Please sign in to cook an idea." }, { status: 401 });

  const keys: UserKeys = {};
  for (const provider of Object.keys(KEY_HEADERS) as KeyProvider[]) {
    const value = req.headers.get(KEY_HEADERS[provider])?.trim();
    if (!value) continue;
    if (!isValidKey(provider, value)) {
      const label = provider === "openrouter" ? "OpenRouter" : "Tavily";
      return NextResponse.json(
        { error: `Your ${label} key doesn't look right. Check it in Settings.`, keyProblem: true },
        { status: 400 }
      );
    }
    keys[provider] = value;
  }

  const ownKey = Boolean(keys.openrouter);
  if (!ownKey && !process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }
  return { visitor, keys, ownKey };
}

/**
 * Use up one run (a free one, or one on the visitor's own key). Returns the
 * usage, or a ready error response when a limit is hit or Redis is down.
 * `limitReached` tells the UI to show a note; `fuelOut` that the server key's
 * pool is empty, so adding a key is the way forward.
 */
export async function takeRun({ visitor, ownKey }: Caller): Promise<Usage | NextResponse> {
  let usage: Usage;
  try {
    usage = await consumeRun(visitor, { ownKey });
  } catch (err) {
    console.warn("Usage limit check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LIMITS_DOWN }, { status: 503 });
  }
  if (usage.blockedBy) {
    return NextResponse.json(
      {
        error: limitMessage(usage.blockedBy),
        limitReached: true,
        fuelOut: usage.blockedBy === "global",
        remaining: usage.remaining,
      },
      { status: 429 }
    );
  }
  return usage;
}

export type Failure = { error: string; outOfJuice?: boolean; keyProblem?: boolean };

/**
 * Explain why every model call failed. A refused or empty user key is named
 * as such (we never fall back to the server key behind their back); every
 * server-key call out of credits or rate-limited means the free fuel is out.
 */
export function explainFailure(reasons: unknown[], ownKey: boolean): Failure {
  if (ownKey && reasons.some(isAuthError)) return { error: KEY_REJECTED, keyProblem: true };
  if (reasons.length > 0 && reasons.every(isQuotaError)) {
    return ownKey ? { error: KEY_EMPTY, keyProblem: true } : { error: FUEL_OUT, outOfJuice: true };
  }
  return { error: GENERIC_ERROR };
}

/** The same as a JSON error response, for the non-streaming routes. */
export function failureResponse(reasons: unknown[], ownKey: boolean) {
  const failure = explainFailure(reasons, ownKey);
  const status = failure.keyProblem ? 400 : failure.outOfJuice ? 429 : 502;
  return NextResponse.json({ ...failure, fuelOut: failure.outOfJuice }, { status });
}
