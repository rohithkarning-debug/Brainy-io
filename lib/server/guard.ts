// Shared checks for every route that spends model calls (/api/expand,
// /api/cross, /api/judge-generation): sign-in, the visitor's own keys, daily
// limits, the shared free pool, and turning model failures into friendly
// messages. Server-only.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { KEY_HEADERS, isValidKey, type KeyProvider } from "@/lib/key-format";
import { BYOK_RUNS_PER_USER_PER_DAY, REJUDGES_PER_USER_PER_DAY, RUNS_PER_USER_PER_DAY } from "@/lib/limits";
import { OutOfCallsError, UnusableReplyError, httpStatus, isAuthError, isDailyLimitError, isKeyLimitError, isTimeout } from "@/lib/openrouter";
import { checkUsage, consumeRejudge, consumeRun, getClientIp, refundRun, type Usage, type Visitor } from "@/lib/ratelimit";
import { createMeter, release, reserve, type Reservation, type RunMeter } from "@/lib/server/quota";

// Shown for any server-side problem. Details go to the logs, never to visitors.
export const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

// The shared free pool is used up for today, or OpenRouter's daily free cap hit.
export const FUEL_OUT = "Brainy's free fuel is out for today. Add your own free OpenRouter key to keep going.";

// The pool has some calls left, but fewer than this run would need.
const NOT_ENOUGH = "Not enough free fuel left today for this run size. Try Quick, or add your own key.";

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
  return `You've used today's ${REJUDGES_PER_USER_PER_DAY} judge retries. Come back tomorrow!`;
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

export type Admission = {
  usage: Usage;
  meter: RunMeter; // pass to every model call, then call meter.finish() at the end
  sharedLeft?: number | null; // shared free calls left after this reservation (server key only)
};

const limitHit = (body: Record<string, unknown>) => NextResponse.json({ limitReached: true, ...body }, { status: 429 });

/**
 * Let a request spend model calls. On the server key it first reserves
 * `calls` from the shared free pool (refused with "not enough fuel" if the
 * pool can't cover them), then uses up a run; a "rejudge" uses up a judge
 * retry instead of a run. On the visitor's own key only their own caps apply.
 * Returns a ready error response when a limit is hit or Redis is down.
 * `limitReached` tells the UI to show a note; `fuelOut` that the shared pool
 * is empty, so adding a key is the way forward.
 */
export async function admit(
  { visitor, ownKey }: Caller,
  { calls, kind = "run" }: { calls: number; kind?: "run" | "rejudge" }
): Promise<Admission | NextResponse> {
  const spend = () => (kind === "rejudge" ? consumeRejudge(visitor) : consumeRun(visitor, { ownKey }));
  try {
    if (ownKey) {
      const usage = await spend();
      if (usage.blockedBy) return limitHit({ error: limitMessage(usage.blockedBy) });
      return { usage, meter: createMeter(null) };
    }

    // Out of free runs is the clearer message, so check that before the pool.
    if (kind === "run") {
      const before = await checkUsage(visitor);
      if (before.blockedBy) return limitHit({ error: limitMessage(before.blockedBy), remaining: before.remaining });
    }

    const reservation: Reservation = await reserve(calls);
    if (!reservation.ok) {
      return reservation.out
        ? limitHit({ error: FUEL_OUT, fuelOut: true, sharedLeft: 0 })
        : limitHit({ error: NOT_ENOUGH, notEnough: true, sharedLeft: reservation.left });
    }

    const usage = await spend();
    if (usage.blockedBy) {
      await release(reservation.day, reservation.count);
      return limitHit({ error: limitMessage(usage.blockedBy), remaining: usage.remaining });
    }
    return { usage, meter: createMeter(reservation), sharedLeft: reservation.left };
  } catch (err) {
    console.warn("Usage limit check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LIMITS_DOWN }, { status: 503 });
  }
}

export type Failure = { error: string; outOfJuice?: boolean; keyProblem?: boolean; busy?: boolean };

// The models themselves failed (rate-limited, refused, gone, down or too slow); nothing is used up.
const ALL_BUSY = "The models are busy right now, try again in a minute.";

function modelTrouble(err: unknown) {
  const status = httpStatus(err);
  return isTimeout(err) || (status !== null && ([403, 404, 408, 429].includes(status) || status >= 500));
}

/**
 * Explain why every model call failed. A refused or empty user key is named
 * as such (we never fall back to the server key behind their back). On the
 * server key, the shared pool running dry or OpenRouter's daily free cap
 * means the free fuel is out. When every failure was the models' own trouble
 * (rate limits, refusals, timeouts), they're busy. Anything else is generic.
 */
export function explainFailure(reasons: unknown[], ownKey: boolean): Failure {
  if (ownKey && reasons.some(isAuthError)) return { error: KEY_REJECTED, keyProblem: true };
  if (!ownKey && reasons.some((r) => r instanceof OutOfCallsError || isDailyLimitError(r))) {
    return { error: FUEL_OUT, outOfJuice: true };
  }
  if (ownKey && reasons.some((r) => httpStatus(r) === 402 || isKeyLimitError(r))) return { error: KEY_EMPTY, keyProblem: true };
  // Busy: every failure was the models' own trouble, or an unusable reply alongside it
  // (e.g. two models refused and a third answered gibberish). Only bad replies: generic.
  const modelsMisbehaved = reasons.every((r) => modelTrouble(r) || r instanceof UnusableReplyError);
  if (reasons.length > 0 && modelsMisbehaved && reasons.some(modelTrouble)) return { error: ALL_BUSY, busy: true };
  return { error: GENERIC_ERROR };
}

function failureStatus(failure: Failure) {
  return failure.keyProblem ? 400 : failure.outOfJuice ? 429 : failure.busy ? 503 : 502;
}

/** The same as a JSON error response, for the non-streaming routes. */
export function failureResponse(reasons: unknown[], ownKey: boolean) {
  const failure = explainFailure(reasons, ownKey);
  return NextResponse.json({ ...failure, fuelOut: failure.outOfJuice }, { status: failureStatus(failure) });
}

/**
 * A request that used up a run failed on our side: give back the run and every
 * shared call it took. Returns the visitor's free runs left afterwards (null
 * when unknown, on their own key, or if the refund itself failed).
 */
export async function refundAdmission(caller: Caller, admission: Admission): Promise<number | null> {
  try {
    await admission.meter.refund();
    return await refundRun(caller.visitor, { ownKey: caller.ownKey });
  } catch (err) {
    console.warn("Refund failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/** refundAdmission, then reply like failureResponse (with the refunded run count). */
export async function refundAndFail(caller: Caller, admission: Admission, reasons: unknown[]) {
  const failure = explainFailure(reasons, caller.ownKey);
  const remaining = await refundAdmission(caller, admission);
  return NextResponse.json(
    { ...failure, fuelOut: failure.outOfJuice, refunded: true, ...(!caller.ownKey && { remaining }) },
    { status: failureStatus(failure) }
  );
}
