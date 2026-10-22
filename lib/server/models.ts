// Model choices shared by the API routes. Server-only (reads env vars).

import { FREE_MODELS } from "@/lib/openrouter";

// One judge model reads everything and gives "Brainy's Take" (and judges
// bred generations). Set JUDGE_MODEL to any OpenRouter model ID; defaults to a free one.
export const JUDGE_MODEL = process.env.JUDGE_MODEL?.trim() || FREE_MODELS[0];

// The model to try first, then the free models if it's out of credits,
// rate-limited or down. `offset` rotates where the free list starts, so
// parallel calls don't all land on the same free model and hit its rate limit.
export function withFallbacks(model: string, offset = 0): string[] {
  const free = FREE_MODELS.filter((m) => m !== model);
  const start = offset % free.length;
  return [model, ...free.slice(start), ...free.slice(0, start)];
}
