// drizzle-kit: `npm run db:generate` writes SQL migrations into ./drizzle from
// lib/server/db/schema.ts; `npm run db:migrate` applies them. Migrations use
// the direct (unpooled) Neon connection.

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
});
