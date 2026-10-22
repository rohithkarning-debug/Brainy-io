// POST /api/judge-generation
// Body: { idea, purpose, length?, tone?, offspring: (ParentIdea & { id, inherits })[] } (2 to 9).
// Optional own-key headers as for /api/expand.
// Returns: { pickId, why, notes: { id, note }[], model, remaining? }
// Errors: { error, limitReached?, fuelOut?, keyProblem? } with a 4xx/5xx status.
//
// The judge's verdict on one generation of bred ideas. Counts as one run
// (or one own-key run). Signed out: 401.

import { NextResponse } from "next/server";
import { MAX_JUDGED } from "@/lib/lineage";
import { judgeOffspring } from "@/lib/openrouter";
import { readBase, readIdea } from "@/lib/server/breed-input";
import { failureResponse, identify, takeRun } from "@/lib/server/guard";
import { JUDGE_MODEL, withFallbacks } from "@/lib/server/models";
import { styleInstruction } from "@/lib/style";

// One 60s call, plus one retry on the next model if it times out or its reply is unusable.
export const maxDuration = 150;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const caller = await identify(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => null);
  const base = readBase(body);
  if ("error" in base) return NextResponse.json({ error: base.error }, { status: 400 });

  const raw: unknown[] = Array.isArray(body?.offspring) ? body.offspring.slice(0, MAX_JUDGED) : [];
  const offspring = raw.flatMap((o) => {
    const r = (o ?? {}) as Record<string, unknown>;
    const idea = readIdea(o, base.purpose);
    const id = typeof r.id === "string" ? r.id.slice(0, 40) : "";
    const inherits = typeof r.inherits === "string" ? r.inherits.slice(0, 300) : "";
    return idea && id ? [{ ...idea, id, inherits }] : [];
  });
  if (offspring.length < 2) {
    return NextResponse.json({ error: "Judging needs at least two bred ideas." }, { status: 400 });
  }

  const usage = await takeRun(caller);
  if (usage instanceof NextResponse) return usage;

  try {
    const verdict = await judgeOffspring(withFallbacks(JUDGE_MODEL), base.idea, base.purpose, offspring, {
      style: styleInstruction(base.length, base.tone),
      signal: req.signal,
      apiKey: caller.keys.openrouter,
    });
    return NextResponse.json({ ...verdict, ...(!caller.ownKey && { remaining: usage.remaining }) });
  } catch (err) {
    console.warn("Generation judge failed:", err instanceof Error ? err.message : err);
    return failureResponse([err], caller.ownKey);
  }
}
