// POST /api/cross
// Body: { idea, purpose, length?, tone?, parents: [ParentIdea, ParentIdea] }
// (see lib/lineage.ts). Optional own-key headers as for /api/expand.
// Returns: { offspring: OffspringJSON[] (up to 3), model, remaining? }
// Errors: { error, limitReached?, fuelOut?, keyProblem? } with a 4xx/5xx status.
//
// Breeds two ideas into three offspring with one model call. Counts as one
// run (or one own-key run), like /api/expand. Signed out: 401.

import { NextResponse } from "next/server";
import { crossIdeas } from "@/lib/openrouter";
import { readBase, readIdea } from "@/lib/server/breed-input";
import { failureResponse, identify, takeRun } from "@/lib/server/guard";
import { CROSS_MODEL, withFallbacks } from "@/lib/server/models";
import { LENGTHS, styleInstruction } from "@/lib/style";

// One 45s call, plus one retry on the next model if it times out or its reply is unusable.
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
  const usage = await takeRun(caller);
  if (usage instanceof NextResponse) return usage;

  try {
    const { offspring, model } = await crossIdeas(withFallbacks(CROSS_MODEL), base.idea, base.purpose, [parents[0], parents[1]], {
      style: styleInstruction(base.length, base.tone),
      maxTokens: LENGTHS[base.length].maxTokens,
      signal: req.signal,
      apiKey: caller.keys.openrouter,
    });
    return NextResponse.json({ offspring, model, ...(!caller.ownKey && { remaining: usage.remaining }) });
  } catch (err) {
    console.warn("Cross failed:", err instanceof Error ? err.message : err);
    return failureResponse([err], caller.ownKey);
  }
}
