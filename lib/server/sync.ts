// Cloud sync: the database side. Every function takes the signed-in user's
// id (from the session, never from the request body) and only ever touches
// that user's rows. Writes are refused unless the user has sync turned on,
// so a stale tab can't re-upload after sync was switched off.
// Server-only.

import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { db, schema } from "@/lib/server/db";
import { isPurpose } from "@/lib/purposes";

const { users, results, userSettings } = schema;

export const syncAvailable = db !== null;

// A result is a few KB, up to ~60 KB with a big family tree and arXiv abstracts.
const MAX_RESULT_BYTES = 300_000;
const MAX_SETTINGS_BYTES = 5_000;
const RESULT_ID = /^[A-Za-z0-9]{1,24}$/;

function database() {
  if (!db) throw new Error("DATABASE_URL is not set");
  return db;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

// Results are shown on public pages, so every `url` must be a plain web link
// (no javascript: or data: links). Anything else is dropped.
function cleanLinks(value: Json): Json {
  if (Array.isArray(value)) return value.map(cleanLinks);
  if (value && typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) {
      if (k === "url" && (typeof v !== "string" || !/^https?:\/\//i.test(v))) continue;
      out[k] = cleanLinks(v);
    }
    return out;
  }
  return value;
}

export type StoredResult = { id: string; data: Record<string, Json>; saved: boolean; createdAt: Date };

/** Check and clean one result from the browser. null = unusable. */
export function readResult(raw: unknown): StoredResult | null {
  const r = raw as Record<string, unknown> | null;
  if (!r || typeof r !== "object") return null;
  if (typeof r.id !== "string" || !RESULT_ID.test(r.id)) return null;
  if (typeof r.idea !== "string" || !isPurpose(r.purpose)) return null;
  if (r.status === "cooking") return null; // only finished results are stored
  if (JSON.stringify(r).length > MAX_RESULT_BYTES) return null;

  // Sharing is decided by the server, never by what the browser sends.
  const { shareSlug: _slug, ...rest } = r;
  void _slug;
  const now = Date.now();
  const createdAt = typeof r.createdAt === "number" && r.createdAt > 0 ? Math.min(r.createdAt, now) : now;
  const lineage = r.lineage as { offspring?: { saved?: unknown }[] } | undefined;
  const saved = r.pinned === true || Boolean(lineage?.offspring?.some((o) => o?.saved === true));
  return {
    id: r.id,
    data: cleanLinks(rest as Json) as Record<string, Json>,
    saved,
    createdAt: new Date(createdAt),
  };
}

/** Whether this user has sync on. False when they've never turned it on. */
export async function isSyncOn(userId: string): Promise<boolean> {
  const [row] = await database().select({ on: users.syncEnabled }).from(users).where(eq(users.id, userId));
  return row?.on ?? false;
}

/** Turn sync on (creating the user row the first time) and store their settings. */
export async function enableSync(user: { id: string; email?: string | null; name?: string | null }, settings: unknown) {
  const d = database();
  await d
    .insert(users)
    .values({ id: user.id, email: user.email ?? null, name: user.name ?? null, syncEnabled: true })
    .onConflictDoUpdate({ target: users.id, set: { syncEnabled: true, email: user.email ?? null, name: user.name ?? null } });
  if (settings !== undefined) await putSettings(user.id, settings);
}

/** Turn sync off. `keep: false` also deletes everything stored for them. */
export async function disableSync(userId: string, keep: boolean) {
  const d = database();
  if (keep) await d.update(users).set({ syncEnabled: false }).where(eq(users.id, userId));
  else await deleteUser(userId);
}

/** "Delete my data": the user row and, by cascade, every result and their settings. */
export async function deleteUser(userId: string) {
  await database().delete(users).where(eq(users.id, userId));
}

/** Every result id (to spot deletions), the results changed after `since`, and their settings. */
export async function pull(userId: string, since: number) {
  const d = database();
  const [ids, changed, settings] = await Promise.all([
    d.select({ id: results.id }).from(results).where(eq(results.userId, userId)),
    d
      .select({ data: results.data, isPublic: results.isPublic, shareSlug: results.shareSlug })
      .from(results)
      .where(and(eq(results.userId, userId), gt(results.updatedAt, new Date(since)))),
    d
      .select({ data: userSettings.data, updatedAt: userSettings.updatedAt })
      .from(userSettings)
      .where(eq(userSettings.userId, userId)),
  ]);
  return {
    ids: ids.map((r) => r.id),
    results: changed.map((r) => ({
      ...(r.data as Record<string, unknown>),
      ...(r.isPublic && r.shareSlug ? { shareSlug: r.shareSlug } : {}),
    })),
    settings: settings[0] ? { data: settings[0].data, updatedAt: settings[0].updatedAt.getTime() } : null,
  };
}

/**
 * Store results, replacing older copies. `updated_at` is the server's clock
 * (devices' clocks drift), so "changed since my last pull" never misses a
 * write; the browser's own `updatedAt` inside the data decides merges.
 */
export async function upsertResults(userId: string, list: StoredResult[]) {
  if (list.length === 0) return 0;
  const now = new Date();
  await database()
    .insert(results)
    .values(list.map((r) => ({ userId, ...r, updatedAt: now })))
    .onConflictDoUpdate({
      target: [results.userId, results.id],
      set: { data: sql`excluded.data`, saved: sql`excluded.saved`, updatedAt: now },
    });
  return list.length;
}

export async function deleteResult(userId: string, id: string) {
  await database().delete(results).where(and(eq(results.userId, userId), eq(results.id, id)));
}

export async function putSettings(userId: string, settings: unknown) {
  if (!settings || typeof settings !== "object" || JSON.stringify(settings).length > MAX_SETTINGS_BYTES) return;
  const now = new Date();
  await database()
    .insert(userSettings)
    .values({ userId, data: settings, updatedAt: now })
    .onConflictDoUpdate({ target: userSettings.userId, set: { data: settings, updatedAt: now } });
}

// 12 URL-safe characters (72 random bits): unguessable, short enough to share.
const newSlug = () => randomBytes(9).toString("base64url");

/**
 * Make one of the user's results public (keeping its slug if it had one) or
 * private again. Returns the slug when public, null when private, or
 * undefined if the result isn't in their cloud copy.
 */
export async function setPublic(userId: string, id: string, isPublic: boolean): Promise<string | null | undefined> {
  const d = database();
  const where = and(eq(results.userId, userId), eq(results.id, id));
  const [row] = await d.select({ slug: results.shareSlug }).from(results).where(where);
  if (!row) return undefined;
  const slug = isPublic ? (row.slug ?? newSlug()) : row.slug;
  // Bumping updated_at lets the user's other devices pick up the new link on their next pull.
  await d.update(results).set({ isPublic, shareSlug: slug, updatedAt: new Date() }).where(where);
  return isPublic ? slug : null;
}

/** A public result by its slug, for /r/[slug]. Anyone can read it; nothing else is exposed. */
export async function publicResult(slug: string): Promise<Record<string, unknown> | null> {
  if (!db || !/^[A-Za-z0-9_-]{8,32}$/.test(slug)) return null;
  const [row] = await db
    .select({ data: results.data })
    .from(results)
    .where(and(eq(results.shareSlug, slug), eq(results.isPublic, true)));
  return (row?.data as Record<string, unknown>) ?? null;
}
