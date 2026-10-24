// The Postgres client for cloud sync: Neon's serverless HTTP driver, so each
// query is one HTTPS request and there's no connection pool to manage on
// Vercel. Reads DATABASE_URL (created by Vercel's Neon integration).
// `db` is null when it isn't set, and sync is then unavailable. Server-only.

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "@/lib/server/db/schema";

const url = process.env.DATABASE_URL;

export const db = url ? drizzle(neon(url), { schema }) : null;
export { schema };
