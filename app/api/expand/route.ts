// POST /api/expand
// Body: { "idea": "...", "purpose": "startup" | "hackathon" | "research" }
// Returns: { baseline: Version | null, versions: Version[], take: BrainyTake | null, search: SearchReport, remaining: number | null }
//
// GET /api/expand
// Returns: { remaining: number | null } (runs this visitor has left today; null = no limits)

import { NextResponse } from "next/server";
import { MAX_IDEA_LENGTH, RUNS_PER_IP_PER_DAY } from "@/lib/limits";
import { generateVersion, judgeIdea, writeSearchQueries, type BrainyTake, type Version } from "@/lib/openrouter";
import { PURPOSES, isPurpose } from "@/lib/purposes";
import { checkUsage, consumeRun, getClientIp, type Usage } from "@/lib/ratelimit";
import { runSearches, skipAll, type SearchReport, type SearchResult } from "@/lib/search";

// Longest this function may run on Vercel, in seconds. The Hobby (free) plan
// allows up to 300. A normal run takes 20-60s; the worst case with every
// timeout hit is about 95s (search chain + models in parallel, then the judge).
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
const JUDGE_MODEL = "anthropic/claude-sonnet-5.5";

// Shared framing so every direction still produces a concrete, finished concept.
const DIRECTION_PREFIX =
  "You are a creative strategist. Turn the user's half-baked idea into a specific, finished concept. Constraint: ";

// Friendly message for each limit (shown as-is in the UI).
function limitMessage(blockedBy: "ip" | "global") {
  return blockedBy === "ip"
    ? `You've used your ${RUNS_PER_IP_PER_DAY} free runs today, come back tomorrow!`
    : "Brainy has hit its daily limit for everyone. Come back tomorrow!";
}

// Shown if Redis is configured but can't be reached. We refuse the run
// rather than risk unlimited use of the API credits.
const LIMITS_DOWN = "Brainy can't check usage limits right now. Please try again in a minute.";

export async function GET(req: Request) {
  try {
    const usage = await checkUsage(getClientIp(req));
    return NextResponse.json({ remaining: usage.remaining });
  } catch (err) {
    console.warn("Usage check failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ remaining: null });
  }
}

export async function POST(req: Request) {
  // 1. Read and check the user's idea and purpose.
  const body = await req.json().catch(() => null);
  const idea = typeof body?.idea === "string" ? body.idea.trim() : "";
  const purpose = body?.purpose;
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
    return NextResponse.json({ error: "Server is missing OPENROUTER_API_KEY." }, { status: 500 });
  }

  // Use up one of today's runs. Done after the checks above, so invalid
  // requests don't count. `limitReached` tells the UI to show a friendly note.
  let usage: Usage;
  try {
    usage = await consumeRun(getClientIp(req));
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

  // 2. Search for similar existing work. This chain (write queries -> search)
  // runs at the same time as the idea generation below, so it adds little wait.
  // It never throws: if anything fails we just get fewer (or no) results.
  const sources = PURPOSES[purpose].sources;
  const searchPromise: Promise<{ results: SearchResult[]; report: SearchReport }> = writeSearchQueries(
    QUERY_MODEL,
    idea,
    purpose
  )
    .then((queries) => runSearches(sources, queries))
    .catch((err) => {
      console.warn("Could not write search queries:", err instanceof Error ? err.message : err);
      return { results: [], report: skipAll(sources, "couldn't write search queries") };
    });

  // 3. Baseline call.
  const baselinePromise = generateVersion(BASELINE_MODEL, BASELINE_PROMPT, idea, purpose).then(
    (result): Version => ({ ...result, direction: "Baseline", model: BASELINE_MODEL })
  );

  // 4. One call per direction for this purpose, rotating through the models (0,1,2,0,1,2,...).
  const directionPromises = PURPOSES[purpose].directions.map((d, i) => {
    const model = MODELS[i % MODELS.length];
    return generateVersion(model, DIRECTION_PREFIX + d.prompt, idea, purpose).then(
      (result): Version => ({ ...result, direction: d.label, model })
    );
  });

  // Promise.allSettled waits for ALL calls and never throws,
  // so one failing model doesn't break the others.
  const [search, [baselineResult, ...directionResults]] = await Promise.all([
    searchPromise,
    Promise.allSettled([baselinePromise, ...directionPromises]),
  ]);

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
    return NextResponse.json({ error: "All models failed. Check your API key and try again." }, { status: 502 });
  }

  // 6. Brainy's Take: the judge sees the idea, every version (baseline included)
  // and the search results. `null` tells it no search ran, so it falls back to
  // its own knowledge. If the judge fails we still return the versions.
  let take: BrainyTake | null = null;
  try {
    const all = baseline ? [baseline, ...versions] : versions;
    const searched = search.report.ran.length > 0;
    take = await judgeIdea(JUDGE_MODEL, idea, purpose, all, searched ? search.results : null);
  } catch (err) {
    console.warn("Judge failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ baseline, versions, take, search: search.report, remaining: usage.remaining });
}
