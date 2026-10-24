// POST /api/judge
// Body: { idea, purpose, length?, tone?, judge?: "auto" | model id,
//         versions: Version[] (the directions and baseline that arrived, 1 to 10),
//         search: { ran: SearchSource[], results: SearchResult[] } }
// Optional own-key headers as for /api/expand.
// Returns: { take: BrainyTake, remaining?, sharedLeft? }
// Errors: { error, limitReached?, fuelOut?, keyProblem?, sharedLeft? } with a 4xx/5xx status.
//
// "Try another judge": re-runs ONLY Brainy's Take on a finished result's
// directions and kept search results, when the run's own judge failed.
// It doesn't use up a run, but it spends model calls (one from the shared
// free pool on the server key), so it has its own per-user daily cap.
// Signed out: 401.

import { NextResponse } from "next/server";
import { readBase, readModelChoice, readSearch, readVersion } from "@/lib/server/breed-input";
import { admit, failureResponse, identify } from "@/lib/server/guard";
import { runJudge } from "@/lib/server/judge-input";
import { lineup } from "@/lib/server/models";
import { poolStatus } from "@/lib/server/quota";
import { styleInstruction } from "@/lib/style";

// Up to two judge attempts, each limited to the time left.
export const maxDuration = 280;
const BUDGET_MS = (maxDuration - 10) * 1000;
export const dynamic = "force-dynamic";

const MAX_VERSIONS = 10; // nine directions plus the baseline

export async function POST(req: Request) {
  const startedAt = Date.now();
  const caller = await identify(req);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => null);
  const base = readBase(body);
  if ("error" in base) return NextResponse.json({ error: base.error }, { status: 400 });
  const raw: unknown[] = Array.isArray(body?.versions) ? body.versions.slice(0, MAX_VERSIONS) : [];
  const versions = raw.flatMap((v) => readVersion(v, base.purpose) ?? []);
  if (versions.length === 0) {
    return NextResponse.json({ error: "There are no directions to judge." }, { status: 400 });
  }
  const search = readSearch(body?.search);

  const admission = await admit(caller, { calls: 1, kind: "rejudge" });
  if (admission instanceof NextResponse) return admission;
  const { meter } = admission;

  try {
    const { judges } = await lineup({ ownKey: caller.ownKey, judge: readModelChoice(body).judge });
    const take = await runJudge(judges, base.idea, base.purpose, versions, search, {
      style: styleInstruction(base.length, base.tone),
      signal: req.signal,
      apiKey: caller.keys.openrouter,
      meter,
      deadline: startedAt + BUDGET_MS,
    });
    await meter.finish();
    const pool = caller.ownKey ? null : await poolStatus().catch(() => null);
    return NextResponse.json({ take, ...(pool && { sharedLeft: pool.left }) });
  } catch (err) {
    console.warn("Re-judge failed:", err instanceof Error ? err.message : err);
    await meter.finish();
    return failureResponse([err], caller.ownKey);
  }
}
