// GET /api/sync?since=<ms>
// Returns: { enabled: false } when sync is off, otherwise
//   { enabled: true, now, ids: string[], results: Result[], settings: { data, updatedAt } | null }
//   `ids` is every result in the cloud copy (so the browser can spot deletions
//   made on another device); `results` are only the ones changed after `since`
//   (server time; pass the previous reply's `now`).
//
// POST /api/sync
// Body: { action: "enable", settings? } -> { enabled: true }   (then upload results via /api/sync/results)
//       { action: "disable", keep: boolean } -> { enabled: false }
//
// Everything is scoped to the signed-in user. Signed out: 401.

import { NextResponse } from "next/server";
import { NO_STORE, syncFailed, syncUser } from "@/lib/server/sync-route";
import { disableSync, enableSync, isSyncOn, pull } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  try {
    if (!(await isSyncOn(user.id))) return NextResponse.json({ enabled: false }, { headers: NO_STORE });
    // Taken before reading, and a second early, so a write landing mid-read is picked up next time.
    const now = Date.now() - 1000;
    const since = Math.max(0, Number(new URL(req.url).searchParams.get("since")) || 0);
    const data = await pull(user.id, since);
    return NextResponse.json({ enabled: true, now, ...data }, { headers: NO_STORE });
  } catch (err) {
    return syncFailed("pull", err);
  }
}

export async function POST(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  try {
    if (body?.action === "enable") {
      await enableSync(user, body.settings);
      return NextResponse.json({ enabled: true });
    }
    if (body?.action === "disable") {
      await disableSync(user.id, body.keep === true);
      return NextResponse.json({ enabled: false });
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (err) {
    return syncFailed(String(body?.action), err);
  }
}
