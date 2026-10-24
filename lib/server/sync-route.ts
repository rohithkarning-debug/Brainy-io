// Shared by the /api/sync routes and /api/me: who is calling (from the
// session, never the body) and the standard error replies. Server-only.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { syncAvailable } from "@/lib/server/sync";

export type SyncUser = { id: string; email: string | null; name: string | null };

/** The signed-in user, or a ready 401 / 503 reply. */
export async function syncUser(): Promise<SyncUser | NextResponse> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!syncAvailable) return NextResponse.json({ error: "Sync isn't set up on this server." }, { status: 503 });
  return { id, email: session.user?.email ?? null, name: session.user?.name ?? null };
}

/** Log a database failure and answer with a plain message. */
export function syncFailed(what: string, err: unknown) {
  console.warn(`Sync ${what} failed:`, err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Couldn't reach Brainy's sync storage. Please try again." }, { status: 502 });
}

export const SYNC_OFF = () => NextResponse.json({ error: "Sync is off for this account.", syncOff: true }, { status: 409 });

export const NO_STORE = { "Cache-Control": "private, no-store" };
