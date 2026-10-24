// POST /api/sync/results   Body: { results: Result[] } (up to 20)  -> { stored, skipped }
// DELETE /api/sync/results?id=<result id>                         -> { ok: true }
//
// Saves or removes results in the signed-in user's cloud copy. Refused with
// 409 { syncOff: true } when their sync is off. Signed out: 401.

import { NextResponse } from "next/server";
import { SYNC_OFF, syncFailed, syncUser } from "@/lib/server/sync-route";
import { deleteResult, isSyncOn, readResult, upsertResults, type StoredResult } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

const MAX_BATCH = 20;

export async function POST(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.results) ? body.results : [];
  if (raw.length === 0 || raw.length > MAX_BATCH) {
    return NextResponse.json({ error: `Send 1 to ${MAX_BATCH} results at a time.` }, { status: 400 });
  }
  const list = raw.map(readResult).filter((r): r is StoredResult => r !== null);
  try {
    if (!(await isSyncOn(user.id))) return SYNC_OFF();
    const stored = await upsertResults(user.id, list);
    return NextResponse.json({ stored, skipped: raw.length - list.length });
  } catch (err) {
    return syncFailed("save", err);
  }
}

export async function DELETE(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[A-Za-z0-9]{1,24}$/.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  try {
    if (!(await isSyncOn(user.id))) return SYNC_OFF();
    await deleteResult(user.id, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return syncFailed("delete", err);
  }
}
