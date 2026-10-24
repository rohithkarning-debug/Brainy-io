// DELETE /api/me  -> { ok: true }
// "Delete my data": removes everything Brainy's database holds for the
// signed-in user (their cloud results, public links and settings). The
// browser clears its own copy separately. Daily usage counters in Upstash
// hold only counts and expire on their own. Signed out: 401.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUser, syncAvailable } from "@/lib/server/sync";
import { syncFailed } from "@/lib/server/sync-route";

export const dynamic = "force-dynamic";

export async function DELETE() {
  const id = (await auth())?.user?.id;
  if (!id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  // No database configured means there's nothing stored server-side.
  if (!syncAvailable) return NextResponse.json({ ok: true });
  try {
    await deleteUser(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return syncFailed("delete-all", err);
  }
}
