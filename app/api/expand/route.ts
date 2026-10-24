// POST /api/expand
// Body: { "idea": "...", "purpose": "startup" | "hackathon" | "research",
//         "length"?: "short" | "medium" | "detailed", "tone"?: "simple" | "technical" | "fun",
//         "size"?: "quick" | "standard" | "full", "baseline"?: boolean, "search"?: boolean,
//         "models"?: string[] (1-4 generator ids; [] = Auto), "judge"?: "auto" | model id }
// Optional headers: x-user-openrouter-key / x-user-tavily-key, the visitor's own
// keys (see lib/key-format.ts). Used for this request only, never stored or logged.
// Bad input or a hit limit: a plain JSON error
// ({ error, limitReached?, fuelOut?, notEnough?, keyProblem?, remaining?, sharedLeft? }).
// Otherwise: a stream of StreamEvent lines (see lib/stream.ts), each sent as soon
// as that piece finishes: start -> search / baseline / version (any order) -> take -> done.
//
// On the server's key a run only ever uses free models, and first reserves
// its estimated model calls from the shared free pool (lib/server/quota.ts).
//
// Signed out: 401 with { error }. Never trust the page to check this.
//
// GET /api/expand
// Returns: { remaining, fuelOut, sharedLeft, sharedTotal }: free runs this user
// has left today (null = no limits or signed out), whether the shared free
// pool is out, and the shared free model calls left today (null = no limits).

import { NextResponse } from "next/server";
import { MAX_IDEA_LENGTH } from "@/lib/limits";
import { generateVersion, writeSearchQueries, type BrainyTake, type CallOptions, type Version } from "@/lib/openrouter";
import { PURPOSES, isPurpose, type Purpose } from "@/lib/purposes";
import { checkUsage } from "@/lib/ratelimit";
import { defaultBaseline, estimateCalls, isRunSize, pickDirections, roundRobin, type RunSize } from "@/lib/run-plan";
import { readModelChoice } from "@/lib/server/breed-input";
import { GENERIC_ERROR, admit, explainFailure, getVisitor, identify } from "@/lib/server/guard";
import { runJudge } from "@/lib/server/judge-input";
import { chainFor, lineup, type Lineup } from "@/lib/server/models";
import { poolStatus } from "@/lib/server/quota";
import { runSearches, skipAll, type SearchReport, type SearchResult } from "@/lib/search";
import { STREAM_CONTENT_TYPE, type RunPlanInfo, type StreamEvent } from "@/lib/stream";
import { LENGTHS, isLength, isTone, styleInstruction, type AnswerLength, type Tone } from "@/lib/style";

// Longest this function may run on Vercel, in seconds. The Hobby (free) plan
// allows up to 300. The time is split in two: the directions, baseline and
// search must be done by GENERATION_MS (a model still thinking then is
// dropped), and the judge gets everything after that, about 150s, so a slow
// first judge still leaves time to try the next one.
export const maxDuration = 280;
const GENERATION_MS = 115_000;
const BUDGET_MS = (maxDuration - 10) * 1000; // a little room to close the stream

// Always run fresh: remaining-run counts must never be cached.
export const dynamic = "force-dynamic";

// The baseline uses a plain prompt: "what a typical AI would say".
const BASELINE_PROMPT =
  "You are a helpful assistant. Turn the user's idea into a finished concept.";

// Shared framing so every direction still produces a concrete, finished concept.
const DIRECTION_PREFIX =
  "You are a creative strategist. Turn the user's half-baked idea into a specific, finished concept. Constraint: ";

// The count is per signed-in user: never let a browser or proxy reuse it.
const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };

export async function GET(req: Request) {
  try {
    const visitor = await getVisitor(req);
    const [usage, pool] = await Promise.all([visitor ? checkUsage(visitor) : null, poolStatus()]);
    return NextResponse.json(
      {
        remaining: usage?.remaining ?? null,
        fuelOut: pool?.out ?? false,
        sharedLeft: pool?.left ?? null,
        sharedTotal: pool?.total ?? null,
      },
      NO_STORE
    );
  } catch (err) {
    console.warn("Usage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ remaining: null, fuelOut: false, sharedLeft: null, sharedTotal: null }, NO_STORE);
  }
}

export async function POST(req: Request) {
  const startedAt = Date.now();

  // 0. Only signed-in users can run Brainy. Also reads (and format-checks) their own keys.
  const caller = await identify(req);
  if (caller instanceof NextResponse) return caller;

  // 1. Read and check the user's idea, purpose, answer style and run setup.
  const body = await req.json().catch(() => null);
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  const purpose = body?.purpose;
  // Optional settings: fall back to the defaults rather than refuse.
  const length: AnswerLength = isLength(body?.length) ? body.length : "medium";
  const tone: Tone = isTone(body?.tone) ? body.tone : "simple";
  const size: RunSize = isRunSize(body?.size) ? body.size : "full";
  const baseline = typeof body?.baseline === "boolean" ? body.baseline : defaultBaseline(size);
  const search = typeof body?.search === "boolean" ? body.search : true;
  const choice = readModelChoice(body);
  if (!idea) {
    return NextResponse.json({ error: "Please enter an idea." }, { status: 400 });
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return NextResponse.json({ error: `Idea is too long (max ${MAX_IDEA_LENGTH} characters).` }, { status: 400 });
  }
  if (!isPurpose(purpose)) {
    return NextResponse.json({ error: "Please pick Startup, Hackathon or Research." }, { status: 400 });
  }

  // Reserve this run's model calls from the shared pool and use up one of
  // today's runs (or one on their own key). Done after the checks above, so
  // invalid requests don't count.
  const admission = await admit(caller, { calls: estimateCalls({ size, baseline, search }) });
  if (admission instanceof NextResponse) return admission;
  const { usage, meter } = admission;

  // Aborted when the visitor presses Stop or closes the tab. It cancels every
  // model call still running, so we stop paying for them.
  const cancel = new AbortController();
  req.signal.addEventListener("abort", () => cancel.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let failed = false; // an "error" event went out, so no "done" follows
      const send = (event: StreamEvent) => {
        if (event.type === "error") failed = true;
        if (cancel.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // The visitor left mid-write; nothing to do.
        }
      };

      try {
        const models = await lineup({ ownKey: caller.ownKey, ...choice });
        const directions = pickDirections(purpose, size);
        const plan: RunPlanInfo = {
          size,
          directions: directions.map((d) => d.label),
          baseline,
          search,
          generators: models.generators,
        };
        // An own-key run leaves the free counts alone, so don't report them.
        send({
          type: "start",
          plan,
          ...(!caller.ownKey && { remaining: usage.remaining, sharedLeft: admission.sharedLeft }),
        });
        await runAll({
          idea,
          purpose,
          directions,
          plan,
          models,
          options: {
            style: styleInstruction(length, tone),
            maxTokens: LENGTHS[length].maxTokens,
            signal: cancel.signal,
            apiKey: caller.keys.openrouter,
            meter,
          },
          generationDeadline: startedAt + GENERATION_MS,
          judgeDeadline: startedAt + BUDGET_MS,
          tavilyKey: caller.keys.tavily,
          ownKey: caller.ownKey,
          send,
        });
      } catch (err) {
        console.warn("Run failed:", err instanceof Error ? err.message : err);
        send({ type: "error", error: GENERIC_ERROR });
      } finally {
        // Hand back reserved calls the run didn't make, then report what's left.
        await meter.finish();
        if (!failed) {
          const pool = caller.ownKey ? null : await poolStatus().catch(() => null);
          send({
            type: "done",
            ...(!caller.ownKey && { sharedLeft: pool?.left ?? null, fuelOut: meter.ranDry || Boolean(pool?.out) }),
          });
        }
        try {
          controller.close();
        } catch {
          // Already closed because the visitor cancelled.
        }
      }
    },
    cancel() {
      cancel.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": `${STREAM_CONTENT_TYPE}; charset=utf-8`,
      // Ask every proxy along the way to pass lines through immediately.
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

// The whole run. Each piece is sent the moment it finishes.
async function runAll({
  idea,
  purpose,
  directions,
  plan,
  models,
  options,
  generationDeadline,
  judgeDeadline,
  tavilyKey,
  ownKey,
  send,
}: {
  idea: string;
  purpose: Purpose;
  directions: { label: string; prompt: string }[];
  plan: RunPlanInfo;
  models: Lineup;
  options: CallOptions;
  generationDeadline: number;
  judgeDeadline: number;
  tavilyKey?: string;
  ownKey: boolean;
  send: (event: StreamEvent) => void;
}) {
  const { signal } = options;
  const generating = { ...options, deadline: generationDeadline };

  // 2. Search for similar existing work. This chain (write queries -> search)
  // runs at the same time as the idea generation below, so it adds little wait.
  // It never throws: if anything fails we just get fewer (or no) results.
  const sources = PURPOSES[purpose].sources;
  const searchPromise: Promise<{ results: SearchResult[]; report: SearchReport }> = (
    plan.search
      ? writeSearchQueries(chainFor(models.fallbacks[0] ?? models.generators[0], models.fallbacks), idea, purpose, generating)
          .then((queries) => runSearches(sources, queries, { tavilyKey }))
          .catch((err) => {
            console.warn("Could not write search queries:", err instanceof Error ? err.message : err);
            return { results: [], report: skipAll(sources, "couldn't write search queries") };
          })
      : Promise.resolve({ results: [], report: skipAll(sources, "turned off for this run") })
  ).then((search) => {
    send({ type: "search", search: search.report, results: search.results });
    return search;
  });

  // 3. Baseline call (optional), on the first generator.
  const baselinePromise: Promise<Version | null> = plan.baseline
    ? generateVersion(chainFor(models.generators[0], models.fallbacks), BASELINE_PROMPT, idea, purpose, generating).then(
        (result): Version => {
          const version = { ...result, direction: "Baseline" };
          send({ type: "baseline", version });
          return version;
        }
      )
    : Promise.resolve(null);

  // 4. One call per direction, spread round-robin across the chosen models.
  // Each falls back through the healthy free models if its own model fails.
  const assigned = roundRobin(directions.length, models.generators);
  const directionPromises = directions.map((d, i) =>
    generateVersion(chainFor(assigned[i], models.fallbacks, i + 1), DIRECTION_PREFIX + d.prompt, idea, purpose, generating).then(
      (result): Version => {
        const version = { ...result, direction: d.label };
        send({ type: "version", version });
        return version;
      }
    )
  );

  // Promise.allSettled waits for ALL calls and never throws,
  // so one failing model doesn't break the others.
  const [search, [baselineResult, ...directionResults]] = await Promise.all([
    searchPromise,
    Promise.allSettled([baselinePromise, ...directionPromises]),
  ]);
  if (signal?.aborted) return;

  // 5. Keep only the calls that succeeded; log the failures for debugging.
  const versions: Version[] = [];
  for (const r of directionResults) {
    if (r.status === "fulfilled") versions.push(r.value);
    else console.warn("Skipped a version:", r.reason?.message ?? r.reason);
  }

  let baseline: Version | null = null;
  if (baselineResult.status === "fulfilled") baseline = baselineResult.value;
  else console.warn("Baseline failed:", baselineResult.reason?.message ?? baselineResult.reason);

  if (!baseline && versions.length === 0) {
    console.warn("All models failed");
    // Out of fuel, or the visitor's own key refused: a clearer note than a generic error.
    const reasons = [baselineResult, ...directionResults].flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    send({ type: "error", ...explainFailure(reasons, ownKey) });
    return;
  }

  // 6. Brainy's Take, with whatever time is left. If the judge fails we still
  // keep the versions, and the page offers "Try another judge".
  let take: BrainyTake | null = null;
  try {
    const all = baseline ? [baseline, ...versions] : versions;
    take = await runJudge(models.judges, idea, purpose, all, search, { ...options, deadline: judgeDeadline });
  } catch (err) {
    console.warn("Judge failed:", err instanceof Error ? err.message : err);
  }
  send({ type: "take", take });
}
