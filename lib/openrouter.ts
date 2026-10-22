// Small helper for talking to OpenRouter (https://openrouter.ai).
// OpenRouter gives us one API that can call many different LLMs.

import { PURPOSES, SOURCE_LABELS, type Purpose } from "@/lib/purposes";
import type { SearchQueries, SearchResult } from "@/lib/search";

// The shape every idea version has once parsed.
// `details` holds the purpose-specific fields, e.g. { revenueModel: "..." }.
export type IdeaJSON = {
  title: string;
  pitch: string; // one-line pitch
  details: Record<string, string>;
};

// One finished version of the idea, plus where it came from.
export type Version = IdeaJSON & {
  direction: string; // e.g. "B2B" — which way we pushed the idea
  model: string; // which LLM produced it
};

// Something that already exists and resembles the idea.
// `url` and `source` are only set when it came from a real search result.
export type SimilarThing = {
  title: string;
  note: string; // one line: how it is similar
  url?: string;
  source?: SearchResult["source"];
};

// What the judge model returns: "Brainy's Take".
export type BrainyTake = {
  saturation: "Fresh" | "Crowded" | "Very saturated";
  saturationReason: string;
  similarExisting: SimilarThing[]; // may be empty
  pick: {
    title: string;
    pitch: string;
    basedOn: string; // a direction label, or "New angle"
    why: string; // why this is the most unique-but-workable option
  };
  alternatives: { title: string; pitch: string }[]; // only when crowded/saturated
  followUps: string[]; // short ideas the user could run through Brainy next
  model: string;
};

// Per-run options passed down from the API route.
export type CallOptions = {
  style?: string; // writing style line from lib/style.ts
  maxTokens?: number;
  signal?: AbortSignal; // aborted when the visitor presses Stop or leaves
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free OpenRouter models (checked October 2026; see https://openrouter.ai/models?q=free).
// Used as the fallback chain when a model is out of credits, rate-limited or down.
// Free models have their own daily request limits, so this is a safety net, not a plan.
export const FREE_MODELS = [
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
];

// Statuses worth trying another model for: out of credits, rate-limited, or down.
function shouldFallBack(status: number) {
  return status === 402 || status === 429 || status >= 500;
}

// A non-2xx reply from OpenRouter, keeping the status so we can decide whether to fall back.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** True if a call failed because the model was out of credits or rate-limited (402/429). */
export function isQuotaError(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 402 || err.status === 429);
}

type CallSettings = { temperature?: number; timeoutMs?: number; maxTokens?: number; signal?: AbortSignal };

/**
 * Send one system + user message to a model and return its raw text reply.
 * Throws on HTTP errors or timeouts.
 */
async function callModel(
  model: string,
  system: string,
  user: string,
  { temperature = 0.9, timeoutMs = 30_000, maxTokens = 800, signal }: CallSettings = {}
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "Brainy", // optional: shows the app name in your OpenRouter dashboard
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature,
      // Cap the reply length. Without this OpenRouter reserves the model's full
      // output limit up front, which can fail on low-credit keys.
      max_tokens: maxTokens,
      // The free fallbacks are reasoning models. Keep their thinking short so it
      // doesn't eat the max_tokens budget, and leave it out of the reply.
      ...(model.endsWith(":free") && { reasoning: { effort: "low", exclude: true } }),
    }),
    // Give up on a slow model instead of hanging forever, and stop paying
    // for the call as soon as the visitor cancels.
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new HttpError(res.status, `${model} returned HTTP ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

/**
 * Try each model in turn until one answers. Only moves on for 402/429/5xx;
 * any other error (bad request, timeout, cancelled) is thrown straight away.
 * Returns the reply and the model that produced it.
 */
async function callWithFallback(
  models: string[],
  system: string,
  user: string,
  settings: CallSettings = {}
): Promise<{ text: string; model: string }> {
  let lastError: unknown = new Error("No models given");
  for (const model of models) {
    try {
      return { text: await callModel(model, system, user, settings), model };
    } catch (err) {
      if (!(err instanceof HttpError) || !shouldFallBack(err.status) || settings.signal?.aborted) throw err;
      console.warn(`Falling back from ${model}:`, err.message);
      lastError = err;
    }
  }
  throw lastError;
}

/**
 * Models sometimes wrap JSON in ```code fences``` or add chatter around it.
 * We grab the text between the first "{" and the last "}" and parse that.
 */
function extractJSON(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("No JSON found in response");
  return JSON.parse(text.slice(start, end + 1));
}

// True if the value is a non-empty string.
function isText(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

/**
 * Ask a model to turn the idea into a finished version for the given purpose.
 * `models` is tried in order (see callWithFallback).
 * Returns the parsed JSON and the model that answered, or throws if every
 * call fails or the JSON is bad.
 */
export async function generateVersion(
  models: string[],
  systemPrompt: string,
  idea: string,
  purpose: Purpose,
  { style, maxTokens, signal }: CallOptions = {}
): Promise<IdeaJSON & { model: string }> {
  const { guidance, fields } = PURPOSES[purpose];

  // Build the expected JSON shape from this purpose's fields, e.g.
  // {"title": "...", "pitch": "one sentence", "method": "how you would answer it", ...}
  const shape = JSON.stringify({
    title: "short catchy name",
    pitch: "one sentence",
    ...Object.fromEntries(fields.map((f) => [f.key, f.hint])),
  });
  const styleLine = style ? `\n\n${style}` : "";
  const system = `${systemPrompt}\n\n${guidance}${styleLine}\n\nRespond with ONLY a JSON object, no markdown, no extra text, in exactly this shape:\n${shape}`;

  const { text, model } = await callWithFallback(models, system, idea, { maxTokens, signal });
  const obj = extractJSON(text);

  // Make sure every field exists and is a non-empty string.
  for (const key of ["title", "pitch", ...fields.map((f) => f.key)]) {
    if (!isText(obj[key])) throw new Error(`Missing field "${key}"`);
  }
  return {
    title: obj.title,
    pitch: obj.pitch,
    details: Object.fromEntries(fields.map((f) => [f.key, obj[f.key]])),
    model,
  };
}

const QUERY_PROMPT = `You write search queries that find things which ALREADY EXIST and resemble a user's idea, so we can check how original it is.

Do not copy the user's wording. Work out the core concept, then search for it the way someone looking for competitors or prior work would.

Return:
- "web": 3 or 4 different web search queries (natural phrasing, each a different angle on the same concept)
- "keywords": 2 or 3 short keyword phrases of 2-4 words each, for GitHub and arXiv keyword search

Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"web": ["...", "..."], "keywords": ["...", "..."]}`;

/**
 * Ask a cheap model to turn the idea into good search queries.
 * `models` is tried in order (see callWithFallback).
 * Throws if the reply is unusable.
 */
export async function writeSearchQueries(
  models: string[],
  idea: string,
  purpose: Purpose,
  signal?: AbortSignal
): Promise<SearchQueries> {
  const { label, searchHint } = PURPOSES[purpose];
  const user = `Purpose: ${label}. Look for: ${searchHint}.\n\nIdea:\n${idea}`;
  const { text } = await callWithFallback(models, QUERY_PROMPT, user, { temperature: 0.3, timeoutMs: 15_000, maxTokens: 300, signal });
  const obj = extractJSON(text);

  const clean = (list: unknown, max: number) =>
    Array.isArray(list) ? list.filter(isText).map((q) => q.trim().slice(0, 200)).slice(0, max) : [];
  const queries = { web: clean(obj.web, 4), keywords: clean(obj.keywords, 3) };
  if (queries.web.length === 0 && queries.keywords.length === 0) throw new Error("No queries returned");
  return queries;
}

// The judge's instructions. Step 1 changes depending on whether a live search ran.
function judgePrompt(searched: boolean) {
  const similarStep = searched
    ? `1. Similar things: read the numbered search results. Keep ONLY the ones that are truly similar to the idea or its versions: real products, companies, projects, repos or papers that do roughly the same thing. Ignore news articles, listicles, "top 10" posts, generic tool pages and anything only loosely related. For each one you keep, give its number and a one-line note on how it is similar. If none are close, return an empty list. Never mention anything that is not in the results.`
    : `1. Similar things: no live search was available. List real existing products, companies, papers or projects that are similar, ONLY if you actually know them, each with a one-line note on how it is similar (empty list if not; never invent names).`;
  const saturationBasis = searched
    ? "Base this on the similar results you kept: no close matches leans Fresh, a few direct matches is Crowded, many strong direct matches is Very saturated."
    : "Base this on what you know.";
  const similarShape = searched ? `[{"id": 3, "note": "..."}]` : `[{"name": "...", "note": "..."}]`;

  return `You are Brainy, a brutally honest judge of ideas. You will get a user's original idea, what it is for, several AI-generated versions of it${searched ? ", and numbered results from a live search for similar existing work" : ""}.

Do five things:
${similarStep}
2. Saturation: judge how crowded this space already is. Pick exactly one of "Fresh", "Crowded", "Very saturated". ${saturationBasis} Give a one-line reason. Never call the idea "unique".
3. Brainy's pick: choose the single most unique-but-still-workable direction. Either take one of the versions and improve it, or propose a new angle none of them found. Say which version it is based on (its direction label) or "New angle".
4. If saturation is "Crowded" or "Very saturated", suggest 1-2 related but less crowded ideas to try instead. If "Fresh", return an empty list.
5. Follow-ups: write 3 short ideas (one sentence, under 20 words each) the user could run through Brainy next, e.g. a sharper niche of your pick, a pivot, or a risky twist. Write them as ideas, not questions to the user.

Respond with ONLY a JSON object, no markdown, no extra text, in exactly this shape:
{"similarExisting": ${similarShape}, "saturation": "Fresh" | "Crowded" | "Very saturated", "saturationReason": "one line", "pick": {"title": "...", "pitch": "one or two sentences", "basedOn": "direction label or New angle", "why": "one or two sentences"}, "alternatives": [{"title": "...", "pitch": "one sentence"}], "followUps": ["...", "...", "..."]}`;
}

const SATURATION_LEVELS = ["Fresh", "Crowded", "Very saturated"] as const;

/**
 * Send the original idea, every generated version and the search results
 * to a stronger model and get back Brainy's honest verdict.
 * `models` is tried in order (see callWithFallback).
 * Pass `results = null` when no search source ran at all.
 * Throws if the reply is unusable.
 */
export async function judgeIdea(
  models: string[],
  idea: string,
  purpose: Purpose,
  versions: Version[],
  results: SearchResult[] | null,
  { style, signal }: CallOptions = {}
): Promise<BrainyTake> {
  const { label, fields } = PURPOSES[purpose];

  // Write each version out as plain text for the judge to read.
  const versionsText = versions
    .map((v) => {
      const details = fields.map((f) => `   ${f.label}: ${v.details[f.key]}`).join("\n");
      return `- [${v.direction}] ${v.title}: ${v.pitch}\n${details}`;
    })
    .join("\n\n");

  // Number the search results so the judge can point at them by id.
  const searched = results !== null;
  const resultsText = !searched
    ? ""
    : results.length === 0
      ? "\n\nSearch results:\n(none found)"
      : "\n\nSearch results:\n" +
        results
          .map((r, i) => `[${i + 1}] (${SOURCE_LABELS[r.source]}) ${r.title}\n   ${r.url}\n   ${r.snippet}`)
          .join("\n");

  const user = `Purpose: ${label}\n\nOriginal idea:\n${idea}\n\nGenerated versions:\n${versionsText}${resultsText}`;

  // Lower temperature: we want a careful judge, not a creative one.
  const system = [judgePrompt(searched), style].filter(Boolean).join(" ");
  // The verdict JSON is usually 600-1,200 tokens; 2,000 leaves room for a
  // free reasoning model's short thinking without reserving a huge budget.
  const { text, model } = await callWithFallback(models, system, user, {
    temperature: 0.4,
    timeoutMs: 60_000,
    maxTokens: 2000,
    signal,
  });
  const obj = extractJSON(text);

  if (!SATURATION_LEVELS.includes(obj.saturation)) throw new Error("Bad saturation value");
  if (!isText(obj.saturationReason)) throw new Error('Missing "saturationReason"');
  if (!isText(obj.pick?.title) || !isText(obj.pick?.pitch)) throw new Error('Missing "pick"');

  return {
    saturation: obj.saturation,
    saturationReason: obj.saturationReason,
    similarExisting: parseSimilar(obj.similarExisting, results),
    pick: {
      title: obj.pick.title,
      pitch: obj.pick.pitch,
      basedOn: isText(obj.pick.basedOn) ? obj.pick.basedOn : "New angle",
      why: isText(obj.pick.why) ? obj.pick.why : "",
    },
    // Keep at most 2 well-formed alternatives, and none if the idea is fresh.
    alternatives:
      obj.saturation === "Fresh" || !Array.isArray(obj.alternatives)
        ? []
        : obj.alternatives.filter((a: { title?: unknown; pitch?: unknown }) => isText(a?.title) && isText(a?.pitch)).slice(0, 2),
    // Capped so a click can drop one straight into the idea box.
    followUps: Array.isArray(obj.followUps)
      ? obj.followUps.filter(isText).map((f: string) => f.trim().slice(0, 300)).slice(0, 3)
      : [],
    model,
  };
}

/**
 * Turn the judge's similar-things list into SimilarThing objects.
 * With search results, the judge only returns ids and we look up the real
 * title + URL ourselves, so a link can never be made up.
 */
function parseSimilar(raw: unknown, results: SearchResult[] | null): SimilarThing[] {
  if (!Array.isArray(raw)) return [];
  const out: SimilarThing[] = [];
  const usedIds = new Set<number>();

  for (const item of raw) {
    const note = isText(item?.note) ? item.note : "";
    if (results) {
      const id = Number(item?.id);
      const hit = results[id - 1]; // ids are 1-based
      if (!hit || usedIds.has(id)) continue; // unknown or duplicate id
      usedIds.add(id);
      out.push({ title: hit.title, url: hit.url, source: hit.source, note });
    } else if (isText(item?.name)) {
      out.push({ title: item.name, note });
    }
  }
  return out.slice(0, 8);
}
