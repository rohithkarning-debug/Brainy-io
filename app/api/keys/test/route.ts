// POST /api/keys/test
// Body: { "provider": "openrouter" | "tavily" }, with the key itself in that
// provider's header (x-user-openrouter-key / x-user-tavily-key).
// Returns: { ok: true } or { ok: false, error }. Signed out: 401.
//
// Checks the key with the provider once and forgets it: never stored or logged.
// Doesn't count as a run.

import { NextResponse } from "next/server";
import { KEY_HEADERS, KEY_PROVIDERS, isValidKey, type KeyProvider } from "@/lib/key-format";
import { getVisitor } from "@/lib/server/guard";

export const dynamic = "force-dynamic";

const TIMEOUT_MS = 10_000;

export async function POST(req: Request) {
  if (!(await getVisitor(req))) {
    return NextResponse.json({ ok: false, error: "Please sign in first." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const provider = body?.provider as KeyProvider;
  if (provider !== "openrouter" && provider !== "tavily") {
    return NextResponse.json({ ok: false, error: "Unknown provider." }, { status: 400 });
  }
  const label = KEY_PROVIDERS[provider].label;
  const key = req.headers.get(KEY_HEADERS[provider])?.trim() ?? "";
  if (!isValidKey(provider, key)) {
    return NextResponse.json({ ok: false, error: `That doesn't look like a ${label} key.` }, { status: 400 });
  }

  try {
    const status = provider === "openrouter" ? await checkOpenRouter(key) : await checkTavily(key);
    if (status === 401 || status === 403) return NextResponse.json({ ok: false, error: `${label} rejected this key.` });
    if (status >= 400) {
      return NextResponse.json({ ok: false, error: `${label} couldn't check the key right now (HTTP ${status}).` });
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: `Couldn't reach ${label}. Please try again.` });
  }
}

// OpenRouter's key endpoint: free, and 401 for a bad key.
// Docs: https://openrouter.ai/docs/api-reference/api-keys/get-current-key
async function checkOpenRouter(key: string): Promise<number> {
  const res = await fetch("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.status;
}

// Tavily has no free "who am I" call, so run the smallest search (1 basic credit).
async function checkTavily(key: string): Promise<number> {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "test", search_depth: "basic", max_results: 1 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return res.status;
}
