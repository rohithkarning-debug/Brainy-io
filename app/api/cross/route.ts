// POST /api/cross
// Body: { idea, purpose, length?, tone?, parents: [ParentIdea, ParentIdea] }
// (see lib/lineage.ts). Optional own-key headers as for /api/expand.
// Returns: { offspring: OffspringJSON[] (up to 3), model, remaining? }
// Errors: { error, limitReached?, fuelOut?, keyProblem?, busy?, refunded?, remaining? } with a 4xx/5xx status.
//
// Breeds two ideas into three offspring with one model call, on the same
// healthy free-model fallback chain as the directions (busy and refusing
// models are skipped). An unusable or cut-off reply is retried once on a
// stricter prompt. Counts as one run (or one own-key run) and one call from
// the shared free pool, but if the cross fails the run and every shared call
// it took are given back. Signed out: 401.

import { NextResponse } from "next/server";
import { crossIdeas } from "@/lib/openrouter";
import { readBase, readIdea } from "@/lib/server/breed-input";
import { admit, identify, refundAndFail } from "@/lib/server/guard";
import { chainFor, lineup } from "@/lib/server/models";
import { LENGTHS, styleInstruction } from "@/lib/style";

// Up to 60s per model, plus one retry if it times out or its reply is
// unusable, all within BUDGET_MS so the reply always gets back to the page.
export const maxDuration = 180;
const BUDGET_MS = (maxDuration - 10) * 1000;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const caller = await identify(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => null);
  const base = readBase(body);
  if ("error" in base) return NextResponse.json({ error: base.error }, { status: 400 });
  const raw = Array.isArray(body?.parents) ? body.parents : [];
  const parents = raw.map((p: unknown) => readIdea(p, base.purpose));
  if (parents.length !== 2 || parents.some((p: unknown) => p === null)) {
    return NextResponse.json({ error: "Pick exactly two ideas to cross." }, { status: 400 });
  }

  // Counted only once the request is known to be valid.
  const admission = await admit(caller, { calls: 1 });
  if (admission instanceof NextResponse) return admission;
  const { usage, meter } = admission;

  try {
    const { fallbacks } = await lineup({ ownKey: caller.ownKey });
    const { offspring, model } = await crossIdeas(chainFor(fallbacks[0], fallbacks), base.idea, base.purpose, [parents[0], parents[1]], {
      style: styleInstruction(base.length, base.tone),
      maxTokens: LENGTHS[base.length].maxTokens,
      signal: req.signal,
      apiKey: caller.keys.openrouter,
      meter,
      deadline: startedAt + BUDGET_MS,
    });
    return NextResponse.json({ offspring, model, ...(!caller.ownKey && { remaining: usage.remaining }) });
  } catch (err) {
    console.warn("Cross failed:", err instanceof Error ? err.message : err);
    return refundAndFail(caller, admission, [err]);
  } finally {
    await meter.finish();
  }
}
