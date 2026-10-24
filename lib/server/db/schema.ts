// Cloud sync tables (Neon Postgres via Drizzle). Only users who turn on
// "Sync history across devices" ever get rows here; everyone else stays
// local-only. Every query is scoped to the signed-in user's id (see
// lib/server/sync.ts). API keys are never stored. After changing this file:
// `npm run db:generate`, then `npm run db:migrate`.

import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(), // the stable account id from auth.ts, e.g. "email:ada@example.com"
  email: text("email"),
  name: text("name"),
  syncEnabled: boolean("sync_enabled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const results = pgTable(
  "results",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    id: text("id").notNull(), // the result id the browser made
    // The whole Result (lib/history.ts): versions, verdict, lineage, run plan,
    // kept search results. Links are cleaned to http(s) before storing.
    data: jsonb("data").notNull(),
    saved: boolean("saved").notNull().default(false),
    isPublic: boolean("is_public").notNull().default(false),
    shareSlug: text("share_slug").unique(), // set the first time it's made public
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.id] }), index("results_user_updated_idx").on(t.userId, t.updatedAt)]
);

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(), // lib/settings.ts Settings: theme, answer style, run setup
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
