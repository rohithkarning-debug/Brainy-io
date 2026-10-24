// GET /api/models[?paid=1]
// Returns: { models: ModelInfo[] } (see lib/run-plan.ts): every usable free
// model with its current health, plus paid models when `paid=1` (only
// own-key users can run those; the server key is free-only and ignores them).
// The list comes from OpenRouter, cached for an hour (lib/server/catalog.ts);
// health is live (lib/server/health.ts). Signed out: 401.

import { NextResponse } from "next/server";
import { getVisitor } from "@/lib/server/guard";
import { modelList } from "@/lib/server/models";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await getVisitor(req))) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  const paid = new URL(req.url).searchParams.get("paid") === "1";
  const models = await modelList({ paid });
  // Free first (biggest context first), then paid by price.
  models.sort(
    (a, b) =>
      Number(b.free) - Number(a.free) ||
      (a.free ? b.context - a.context : (a.price?.prompt ?? 0) - (b.price?.prompt ?? 0))
  );
  return NextResponse.json({ models });
}
