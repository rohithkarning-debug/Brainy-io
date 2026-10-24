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
// If nothing at all comes back, the run and those calls are given back.
// The run itself lives in lib/server/expand-run.ts.
//
// Signed out: 401 with { error }. Never trust the page to check this.
//
// GET /api/expand
// Returns: { remaining, fuelOut, sharedLeft, sharedTotal }: free runs this user
// has left today (null = no limits or signed out), whether the shared free
// pool is out, and the shared free model calls left today (null = no limits).

import { NextResponse } from "next/server";
import { MAX_IDEA_LENGTH } from "@/lib/limits";
import { isPurpose } from "@/lib/purposes";
import { checkUsage } from "@/lib/ratelimit";
import { defaultBaseline, estimateCalls, isRunSize, pickDirections, type RunSize } from "@/lib/run-plan";
import { readModelChoice } from "@/lib/server/breed-input";
import { runIdea } from "@/lib/server/expand-run";
import { GENERIC_ERROR, admit, getVisitor, identify, refundAdmission, type Failure } from "@/lib/server/guard";
import { lineup } from "@/lib/server/models";
import { poolStatus } from "@/lib/server/quota";
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
      // Nothing came back: give the run and its shared calls back, then say why.
      const fail = async (failure: Failure) => {
        const remaining = await refundAdmission(caller, admission);
        send({ type: "error", ...failure, ...(!caller.ownKey && { remaining }) });
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
        const failure = await runIdea({
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
        if (failure) await fail(failure);
      } catch (err) {
        console.warn("Run failed:", err instanceof Error ? err.message : err);
        await fail({ error: GENERIC_ERROR });
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
