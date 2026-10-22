// POST /api/expand
// Body: { "idea": "...", "purpose": "startup" | "hackathon" | "research",
//         "length"?: "short" | "medium" | "detailed", "tone"?: "simple" | "technical" | "fun" }
// Bad input or a hit limit: a plain JSON error ({ error, limitReached?, remaining? }).
// Otherwise: a stream of StreamEvent lines (see lib/stream.ts), each sent as soon
// as that piece finishes: start -> search / baseline / version (any order) -> take -> done.
//
// Signed out: 401 with { error }. Never trust the page to check this.
//
// GET /api/expand
// Returns: { remaining: number | null } (runs this user has left today; null = no limits or signed out)

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { MAX_IDEA_LENGTH, RUNS_PER_USER_PER_DAY } from "@/lib/limits";
import {
  FREE_MODELS,
  generateVersion,
  judgeIdea,
  writeSearchQueries,
  type BrainyTake,
  type Version,
} from "@/lib/openrouter";
import { PURPOSES, isPurpose, type Purpose } from "@/lib/purposes";
import { checkUsage, consumeRun, getClientIp, type Usage, type Visitor } from "@/lib/ratelimit";
import { runSearches, skipAll, type SearchReport, type SearchResult } from "@/lib/search";
import { STREAM_CONTENT_TYPE, type StreamEvent } from "@/lib/stream";
import { LENGTHS, isLength, isTone, styleInstruction, type AnswerLength, type Tone } from "@/lib/style";

// Longest this function may run on Vercel, in seconds. The Hobby (free) plan
// allows up to 300. A normal run takes 20-60s; the worst case with every
// timeout hit is about 95s (search chain + models in parallel, then the judge).
// Model fallbacks don't change this much: they only kick in on quick failures
// (402/429/5xx), never on a timeout.
export const maxDuration = 120;

// Always run fresh: remaining-run counts must never be cached.
export const dynamic = "force-dynamic";

// Cheap models we spread the work across. Swap these for any OpenRouter model ID.
const MODELS = [
  "google/gemini-2.5-flash-lite",
  "openai/gpt-4o-mini",
  "meta-llama/llama-3.3-70b-instruct",
];

// The baseline uses one model with a plain prompt: "what a typical AI would say".
const BASELINE_MODEL = "openai/gpt-4o-mini";
const BASELINE_PROMPT =
  "You are a helpful assistant. Turn the user's idea into a finished concept.";

// A fast, cheap model writes the search queries.
const QUERY_MODEL = "google/gemini-2.5-flash-lite";

// One stronger model reads everything and gives "Brainy's Take".
// Set JUDGE_MODEL to any OpenRouter model ID; defaults to a free one.
const JUDGE_MODEL = process.env.JUDGE_MODEL?.trim() || FREE_MODELS[0];

// The model to try first, then the free models if it's out of credits,
// rate-limited or down. `offset` rotates where the free list starts, so
// parallel calls don't all land on the same free model and hit its rate limit.
function withFallbacks(model: string, offset = 0): string[] {
  const free = FREE_MODELS.filter((m) => m !== model);
  const start = offset % free.length;
  return [model, ...free.slice(start), ...free.slice(0, start)];
}

// Shown for any server-side problem. Details go to the logs, never to visitors.
const GENERIC_ERROR = "Something went wrong on our side. Please try again.";

// Shared framing so every direction still produces a concrete, finished concept.
const DIRECTION_PREFIX =
  "You are a creative strategist. Turn the user's half-baked idea into a specific, finished concept. Constraint: ";

// Friendly message for each limit (shown as-is in the UI).
function limitMessage(blockedBy: "user" | "ip" | "global") {
  if (blockedBy === "user") return `You've used your ${RUNS_PER_USER_PER_DAY} free runs today, come back tomorrow!`;
  if (blockedBy === "ip") return "Too many runs from this network today. Come back tomorrow!";
  return "Brainy has hit its daily limit for everyone. Come back tomorrow!";
}

// The signed-in user and their IP, or null when signed out.
async function getVisitor(req: Request): Promise<Visitor | null> {
  const session = await auth();
  const userId = session?.user?.id;
  return userId ? { userId, ip: getClientIp(req) } : null;
}

// Shown if Redis is configured but can't be reached. We refuse the run
// rather than risk unlimited use of the API credits.
const LIMITS_DOWN = "Brainy can't check usage limits right now. Please try again in a minute.";

export async function GET(req: Request) {
  try {
    const visitor = await getVisitor(req);
    if (!visitor) return NextResponse.json({ remaining: null });
    const usage = await checkUsage(visitor);
    return NextResponse.json({ remaining: usage.remaining });
  } catch (err) {
    console.warn("Usage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ remaining: null });
  }
}

export async function POST(req: Request) {
  // 0. Only signed-in users can run Brainy.
  const visitor = await getVisitor(req);
  if (!visitor) {
    return NextResponse.json({ error: "Please sign in to cook an idea." }, { status: 401 });
  }

  // 1. Read and check the user's idea, purpose and style settings.
  const body = await req.json().catch(() => null);
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  const purpose = body?.purpose;
  // Style settings are optional: fall back to the defaults rather than refuse.
  const length: AnswerLength = isLength(body?.length) ? body.length : "medium";
  const tone: Tone = isTone(body?.tone) ? body.tone : "simple";
  if (!idea) {
    return NextResponse.json({ error: "Please enter an idea." }, { status: 400 });
  }
  if (idea.length > MAX_IDEA_LENGTH) {
    return NextResponse.json({ error: `Idea is too long (max ${MAX_IDEA_LENGTH} characters).` }, { status: 400 });
  }
  if (!isPurpose(purpose)) {
    return NextResponse.json({ error: "Please pick Startup, Hackathon or Research." }, { status: 400 });
  }
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set");
    return NextResponse.json({ error: GENERIC_ERROR }, { status: 500 });
  }

  // Use up one of today's runs. Done after the checks above, so invalid
  // requests don't count. `limitReached` tells the UI to show a friendly note.
  let usage: Usage;
  try {
    usage = await consumeRun(visitor);
  } catch (err) {
    console.warn("Usage limit check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: LIMITS_DOWN }, { status: 503 });
  }
  if (usage.blockedBy) {
    return NextResponse.json(
      { error: limitMessage(usage.blockedBy), limitReached: true, remaining: usage.remaining },
      { status: 429 }
    );
  }

  // Aborted when the visitor presses Stop or closes the tab. It cancels every
  // model call still running, so we stop paying for them.
  const cancel = new AbortController();
  req.signal.addEventListener("abort", () => cancel.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: StreamEvent) => {
        if (cancel.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // The visitor left mid-write; nothing to do.
        }
      };

      try {
        send({ type: "start", remaining: usage.remaining });
        await runAll({
          idea,
          purpose,
          style: styleInstruction(length, tone),
          maxTokens: LENGTHS[length].maxTokens,
          signal: cancel.signal,
          send,
        });
      } catch (err) {
        console.warn("Run failed:", err instanceof Error ? err.message : err);
        send({ type: "error", error: GENERIC_ERROR });
      } finally {
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
  style,
  maxTokens,
  signal,
  send,
}: {
  idea: string;
  purpose: Purpose;
  style: string;
  maxTokens: number;
  signal: AbortSignal;
  send: (event: StreamEvent) => void;
}) {
  const options = { style, maxTokens, signal };

  // 2. Search for similar existing work. This chain (write queries -> search)
  // runs at the same time as the idea generation below, so it adds little wait.
  // It never throws: if anything fails we just get fewer (or no) results.
  const sources = PURPOSES[purpose].sources;
  const searchPromise: Promise<{ results: SearchResult[]; report: SearchReport }> = writeSearchQueries(
    withFallbacks(QUERY_MODEL),
    idea,
    purpose,
    signal
  )
    .then((queries) => runSearches(sources, queries))
    .catch((err) => {
      console.warn("Could not write search queries:", err instanceof Error ? err.message : err);
      return { results: [], report: skipAll(sources, "couldn't write search queries") };
    })
    .then((search) => {
      send({ type: "search", search: search.report });
      return search;
    });

  // 3. Baseline call.
  const baselinePromise = generateVersion(withFallbacks(BASELINE_MODEL), BASELINE_PROMPT, idea, purpose, options).then(
    (result): Version => {
      const version = { ...result, direction: "Baseline" };
      send({ type: "baseline", version });
      return version;
    }
  );

  // 4. One call per direction for this purpose, rotating through the models (0,1,2,0,1,2,...).
  // Each falls back through the free models if its own model fails.
  const directionPromises = PURPOSES[purpose].directions.map((d, i) => {
    const models = withFallbacks(MODELS[i % MODELS.length], i + 1);
    return generateVersion(models, DIRECTION_PREFIX + d.prompt, idea, purpose, options).then((result): Version => {
      const version = { ...result, direction: d.label };
      send({ type: "version", version });
      return version;
    });
  });

  // Promise.allSettled waits for ALL calls and never throws,
  // so one failing model doesn't break the others.
  const [search, [baselineResult, ...directionResults]] = await Promise.all([
    searchPromise,
    Promise.allSettled([baselinePromise, ...directionPromises]),
  ]);
  if (signal.aborted) return;

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
    send({ type: "error", error: GENERIC_ERROR });
    return;
  }

  // 6. Brainy's Take: the judge sees the idea, every version (baseline included)
  // and the search results. `null` tells it no search ran, so it falls back to
  // its own knowledge. If the judge fails we still keep the versions.
  let take: BrainyTake | null = null;
  try {
    const all = baseline ? [baseline, ...versions] : versions;
    const searched = search.report.ran.length > 0;
    take = await judgeIdea(withFallbacks(JUDGE_MODEL), idea, purpose, all, searched ? search.results : null, options);
  } catch (err) {
    console.warn("Judge failed:", err instanceof Error ? err.message : err);
  }
  send({ type: "take", take });
  send({ type: "done" });
}
