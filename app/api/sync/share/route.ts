// POST /api/sync/share   Body: { id, public: boolean }  -> { slug: string | null }
// Makes one of the signed-in user's synced results public at /r/<slug>
// (read-only, no sign-in needed), or private again. The slug is kept, so
// making it public again restores the same link. 404 if the result isn't in
// their cloud copy. Signed out: 401.

import { NextResponse } from "next/server";
import { SYNC_OFF, syncFailed, syncUser } from "@/lib/server/sync-route";
import { isSyncOn, setPublic } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await syncUser();
  if (user instanceof NextResponse) return user;
  const body = await req.json().catch(() => null);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!/^[A-Za-z0-9]{1,24}$/.test(id) || typeof body?.public !== "boolean") {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  try {
    if (!(await isSyncOn(user.id))) return SYNC_OFF();
    const slug = await setPublic(user.id, id, body.public);
    if (slug === undefined) return NextResponse.json({ error: "That result isn't synced yet." }, { status: 404 });
    return NextResponse.json({ slug });
  } catch (err) {
    return syncFailed("share", err);
  }
}
