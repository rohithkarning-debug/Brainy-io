// POST /api/expand
// Body: { "idea": "...", "purpose": "startup" | "hackathon" | "research",
//         "length"?: "short" | "medium" | "detailed", "tone"?: "simple" | "technical" | "fun" }
// Optional headers: x-user-openrouter-key / x-user-tavily-key, the visitor's own
// keys (see lib/key-format.ts). Used for this request only, never stored or logged.
// Bad input or a hit limit: a plain JSON error ({ error, limitReached?, fuelOut?, keyProblem?, remaining? }).
// Otherwise: a stream of StreamEvent lines (see lib/stream.ts), each sent as soon
// as that piece finishes: start -> search / baseline / version (any order) -> take -> done.
//
// Signed out: 401 with { error }. Never trust the page to check this.
//
// GET /api/expand
// Returns: { remaining: number | null, fuelOut: boolean } (free runs this user has left
// today, null = no limits or signed out; fuelOut = the server key's daily pool is used up)

import { NextResponse } from "next/server";
import { MAX_IDEA_LENGTH } from "@/lib/limits";
import {
  generateVersion,
  judgeIdea,
  writeSearchQueries,
  type BrainyTake,
  type Version,
} from "@/lib/openrouter";
import { PURPOSES, isPurpose, type Purpose } from "@/lib/purposes";
import { checkUsage } from "@/lib/ratelimit";
import { JUDGE_MODEL, withFallbacks } from "@/lib/server/models";
import { GENERIC_ERROR, explainFailure, getVisitor, identify, takeRun, type UserKeys } from "@/lib/server/guard";
import { runSearches, skipAll, type SearchReport, type SearchResult } from "@/lib/search";
import { STREAM_CONTENT_TYPE, type StreamEvent } from "@/lib/stream";
import { LENGTHS, isLength, isTone, styleInstruction, type AnswerLength, type Tone } from "@/lib/style";

// Longest this function may run on Vercel, in seconds. The Hobby (free) plan
// allows up to 300. A normal run takes 20-90s. The worst case with every
// timeout hit is about 250s: the search chain (with arXiv's 3-second queue)
// alongside the models, then a judge that times out at 100s (90s without the
// Devpost / arXiv sections) and, if it times out or its reply is unusable,
// one retry on the next model. Other model fallbacks only kick in on quick
// failures (402/404/429/5xx), never on a timeout.
export const maxDuration = 280;

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

// Shared framing so every direction still produces a concrete, finished concept.
const DIRECTION_PREFIX =
  "You are a creative strategist. Turn the user's half-baked idea into a specific, finished concept. Constraint: ";

export async function GET(req: Request) {
  try {
    const visitor = await getVisitor(req);
    if (!visitor) return NextResponse.json({ remaining: null, fuelOut: false });
    const usage = await checkUsage(visitor);
    return NextResponse.json({ remaining: usage.remaining, fuelOut: usage.blockedBy === "global" });
  } catch (err) {
    console.warn("Usage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ remaining: null, fuelOut: false });
  }
}

export async function POST(req: Request) {
  // 0. Only signed-in users can run Brainy. Also reads (and format-checks) their own keys.
  const caller = await identify(req);
  if (caller instanceof NextResponse) return caller;

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
  // Use up one of today's runs (or one on their own key). Done after the
  // checks above, so invalid requests don't count.
  const usage = await takeRun(caller);
  if (usage instanceof NextResponse) return usage;

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
        // An own-key run leaves the free-run count alone, so don't report one.
        send({ type: "start", ...(!caller.ownKey && { remaining: usage.remaining }) });
        await runAll({
          idea,
          purpose,
          style: styleInstruction(length, tone),
          maxTokens: LENGTHS[length].maxTokens,
          signal: cancel.signal,
          keys: caller.keys,
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
  keys,
  send,
}: {
  idea: string;
  purpose: Purpose;
  style: string;
  maxTokens: number;
  signal: AbortSignal;
  keys: UserKeys;
  send: (event: StreamEvent) => void;
}) {
  const ownKey = Boolean(keys.openrouter);
  const options = { style, maxTokens, signal, apiKey: keys.openrouter };

  // 2. Search for similar existing work. This chain (write queries -> search)
  // runs at the same time as the idea generation below, so it adds little wait.
  // It never throws: if anything fails we just get fewer (or no) results.
  const sources = PURPOSES[purpose].sources;
  const searchPromise: Promise<{ results: SearchResult[]; report: SearchReport }> = writeSearchQueries(
    withFallbacks(QUERY_MODEL),
    idea,
    purpose,
    { signal, apiKey: keys.openrouter }
  )
    .then((queries) => runSearches(sources, queries, { tavilyKey: keys.tavily }))
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
    // Out of fuel, or the visitor's own key refused: a clearer note than a generic error.
    const reasons = [baselineResult, ...directionResults].map((r) => (r.status === "rejected" ? r.reason : null));
    send({ type: "error", ...explainFailure(reasons, ownKey) });
    return;
  }

  // 6. Brainy's Take: the judge sees the idea, every version (baseline included)
  // and the search results. `null` tells it no search ran, so it falls back to
  // its own knowledge. If the judge fails we still keep the versions.
  let take: BrainyTake | null = null;
  try {
    const all = baseline ? [baseline, ...versions] : versions;
    // Web and GitHub feed "similar things"; Devpost and arXiv get their own
    // sections (Built before, Papers), and are only passed when they ran.
    const { ran } = search.report;
    const general = search.results.filter((r) => r.source === "web" || r.source === "github");
    const generalRan = ran.includes("web") || ran.includes("github");
    const special = {
      ...(ran.includes("devpost") && { devpost: search.results.filter((r) => r.source === "devpost") }),
      ...(ran.includes("arxiv") && { arxiv: search.results.filter((r) => r.source === "arxiv") }),
    };
    take = await judgeIdea(withFallbacks(JUDGE_MODEL), idea, purpose, all, generalRan ? general : null, options, special);
  } catch (err) {
    console.warn("Judge failed:", err instanceof Error ? err.message : err);
  }
  send({ type: "take", take });
  send({ type: "done" });
}
