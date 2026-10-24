// PUT /api/sync/settings   Body: { settings }  -> { ok: true }
// Stores the signed-in user's settings (theme, answer style, run setup; never
// API keys) when their sync is on. 409 { syncOff: true } otherwise. Signed out: 401.

import { NextResponse } from "next/server";
import { SYNC_OFF, syncFailed, syncUser } from "@/lib/server/sync-route";
import { isSyncOn, putSettings } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export async function PUT(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  try {
    if (!(await isSyncOn(user.id))) return SYNC_OFF();
    await putSettings(user.id, body?.settings);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return syncFailed("settings", err);
  }
}
