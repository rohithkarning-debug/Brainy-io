// Small helper for talking to OpenRouter (https://openrouter.ai).
// OpenRouter gives us one API that can call many different LLMs.

import type { ParentIdea } from "@/lib/lineage";
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
  builtBefore?: BuiltBefore; // Hackathon only, when the Devpost search ran
  papers?: PaperReport; // Research only, when the arXiv search ran
};

export type Closeness = "high" | "medium" | "low";

// "Already built at a hackathon": Devpost projects the judge kept as similar.
// Every title and link comes from the search results, never from the model.
export type BuiltBefore = {
  found: number; // how many similar projects the judge kept (an honest count, not "built N times")
  projects: { title: string; url: string; summary: string; closeness: Closeness }[]; // closest first
  twist: string; // the twist none of them tried, for Brainy's pick
};

// "Papers that almost did this": arXiv papers the judge kept as close.
export type PaperReport = {
  papers: { title: string; url: string; authors: string[]; year?: number; did: string; missed: string }[];
  gap: string; // the specific gap Brainy's pick fills
  confident: boolean; // false = the judge says it isn't sure
};

// Per-run options passed down from the API route.
export type CallOptions = {
  style?: string; // writing style line from lib/style.ts
  maxTokens?: number;
  signal?: AbortSignal; // aborted when the visitor presses Stop or leaves
  apiKey?: string; // the visitor's own OpenRouter key; defaults to the server's
  meter?: Meter; // counts calls and records model health (see lib/server/quota.ts)
  deadline?: number; // ms since epoch: no call may run past this
};

/**
 * Watches every request a run makes. `take` runs before each one and throws
 * (an OutOfCallsError) to refuse it, e.g. when the shared free pool is empty;
 * `failed` hears about every failed request, to mark models busy.
 */
export type Meter = {
  take(model: string): Promise<void>;
  failed(model: string, err: unknown): void;
};

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free OpenRouter models (checked October 2026; see https://openrouter.ai/models?q=free).
// Only used when the live model list (lib/server/catalog.ts) can't be fetched.
export const FREE_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

// A non-2xx reply from OpenRouter, keeping the status so we can decide whether to fall back.
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A model answered, but not with usable JSON (missing, cut off, or missing a field), twice. */
export class UnusableReplyError extends Error {}

/** The shared free pool ran dry mid-run, so this call was never sent. */
export class OutOfCallsError extends Error {
  constructor() {
    super("The shared free pool is used up for today");
  }
}

/** OpenRouter's daily cap on free-model requests for this key ("free-models-per-day"). */
export function isDailyLimitError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 429 && /free-models-per-day/i.test(err.message);
}

/** A limit on the whole key rather than on one model: trying another model won't help. */
export function isKeyLimitError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 429 && /free-models-per-(day|min)/i.test(err.message);
}

// Statuses worth trying another model for: out of credits, refused (403,
// e.g. a free model OpenRouter now limits to "agentic harnesses"), no longer
// offered by its provider (404), timed out upstream (408), rate-limited or down.
function shouldFallBack(err: HttpError) {
  if (isKeyLimitError(err)) return false;
  return [402, 403, 404, 408, 429].includes(err.status) || err.status >= 500;
}

/** True if a call gave up because the model took too long. */
export function isTimeout(err: unknown): boolean {
  return err instanceof Error && err.name === "TimeoutError";
}

/** True if OpenRouter refused the API key itself (401). */
export function isAuthError(err: unknown): boolean {
  return err instanceof HttpError && err.status === 401;
}

/** The HTTP status of a failed call, if it got that far. */
export function httpStatus(err: unknown): number | null {
  return err instanceof HttpError ? err.status : null;
}

type CallSettings = {
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string; // used for this call only; never stored or logged
  meter?: Meter;
  deadline?: number;
};

// Less time than this before the deadline isn't worth starting a call for.
const MIN_CALL_MS = 8_000;

/**
 * Send one system + user message to a model and return its raw text reply.
 * Throws on HTTP errors or timeouts.
 */
async function callModel(
  model: string,
  system: string,
  user: string,
  {
    temperature = 0.9,
    timeoutMs = 30_000,
    maxTokens = 800,
    signal,
    apiKey = process.env.OPENROUTER_API_KEY,
    meter,
    deadline,
  }: CallSettings = {}
): Promise<string> {
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set");
  // Never run past the run's time budget; a call that can't finish isn't sent (or counted).
  const timeout = deadline ? Math.min(timeoutMs, deadline - Date.now()) : timeoutMs;
  if (timeout < MIN_CALL_MS) throw new DOMException(`No time left for ${model}`, "TimeoutError");
  await meter?.take(model);

  try {
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
        // Free models are mostly reasoning models. Keep their thinking short so it
        // doesn't eat the max_tokens budget, and leave it out of the reply.
        ...(model.endsWith(":free") && { reasoning: { effort: "low", exclude: true } }),
      }),
      // Give up on a slow model instead of hanging forever, and stop paying
      // for the call as soon as the visitor cancels.
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      throw new HttpError(res.status, `${model} returned HTTP ${res.status}: ${await res.text()}`);
    }

    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (!signal?.aborted) meter?.failed(model, err);
    throw err;
  }
}

/**
 * Try each model in turn until one answers. Only moves on for 402/404/429/5xx
 * from that model; anything else (a key-wide limit, bad request, timeout,
 * cancelled, the free pool running dry) is thrown straight away.
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
      if (!(err instanceof HttpError) || !shouldFallBack(err) || settings.signal?.aborted) throw err;
      console.warn(`Falling back from ${model}:`, err.message);
      lastError = err;
    }
  }
  throw lastError;
}

// Added to the instructions on the second attempt after an unusable reply.
const STRICTER =
  "\n\nIMPORTANT: a previous reply could not be used because its JSON was invalid or cut off. Reply with ONLY the JSON object: nothing before or after it, no markdown, every field brief so it fits.";

/**
 * Like callWithFallback, but the reply must also parse. Long JSON replies
 * (the verdict, a cross) occasionally come back malformed or cut off, and free
 * reasoning models sometimes run past their timeout. Either way we try once
 * more: after a timeout with the next model, after an unusable reply with the
 * next model (or the same one if it was the last) on a stricter prompt with
 * more room to answer.
 */
async function callAndParse<T>(
  models: string[],
  system: string,
  user: string,
  settings: CallSettings,
  parse: (text: string, model: string) => T
): Promise<T> {
  let remaining = models;
  let lastError: unknown = new Error("No models given");
  for (let attempt = 0; attempt < 2 && remaining.length > 0; attempt++) {
    let reply: { text: string; model: string };
    try {
      reply = await callWithFallback(remaining, system, user, settings);
    } catch (err) {
      // Only a timeout of the first model in line is worth another go; the
      // fallback chain already handled quick failures, and a cancel is final.
      const timedOut = err instanceof Error && err.name === "TimeoutError";
      if (!timedOut || settings.signal?.aborted) throw err;
      console.warn(`Timed out on ${remaining[0]}, trying the next model`);
      lastError = err;
      remaining = remaining.slice(1);
      continue;
    }
    try {
      return parse(reply.text, reply.model);
    } catch (err) {
      if (settings.signal?.aborted) throw err;
      console.warn(`Unusable reply from ${reply.model}:`, err instanceof Error ? err.message : err);
      lastError = new UnusableReplyError(`${reply.model}: ${err instanceof Error ? err.message : String(err)}`);
      const next = remaining.slice(remaining.indexOf(reply.model) + 1);
      remaining = next.length > 0 ? next : [reply.model];
      system += STRICTER;
      settings = { ...settings, maxTokens: Math.min(Math.round((settings.maxTokens ?? 800) * 1.5), 4000) };
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
  { style, maxTokens, signal, apiKey, meter, deadline }: CallOptions = {}
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

  // An unusable reply (no JSON, cut off, a field missing) gets one stricter retry.
  return callAndParse(models, system, idea, { maxTokens, signal, apiKey, meter, deadline }, (text, model) => {
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
  });
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
  { signal, apiKey, meter, deadline }: CallOptions = {}
): Promise<SearchQueries> {
  const { label, searchHint } = PURPOSES[purpose];
  const user = `Purpose: ${label}. Look for: ${searchHint}.\n\nIdea:\n${idea}`;
  const settings = { temperature: 0.3, timeoutMs: 15_000, maxTokens: 300, signal, apiKey, meter, deadline };
  const clean = (list: unknown, max: number) =>
    Array.isArray(list) ? list.filter(isText).map((q) => q.trim().slice(0, 200)).slice(0, max) : [];
  return callAndParse(models, QUERY_PROMPT, user, settings, (text) => {
    const obj = extractJSON(text);
    const queries = { web: clean(obj.web, 4), keywords: clean(obj.keywords, 3) };
    if (queries.web.length === 0 && queries.keywords.length === 0) throw new Error("No queries returned");
    return queries;
  });
}

// The judge's instructions. Step 1 changes depending on whether a live search
// ran; steps 6 and 7 only appear for Hackathon (Devpost) and Research (arXiv).
function judgePrompt(searched: boolean, { devpost = false, arxiv = false }: { devpost?: boolean; arxiv?: boolean } = {}) {
  const similarStep = searched
    ? `1. Similar things: read the numbered search results. Keep ONLY the ones that are truly similar to the idea or its versions: real products, companies, projects, repos or papers that do roughly the same thing. Ignore news articles, listicles, "top 10" posts, generic tool pages and anything only loosely related. For each one you keep, give its number and a one-line note on how it is similar. If none are close, return an empty list. Never mention anything that is not in the results.`
    : `1. Similar things: no live search was available. List real existing products, companies, papers or projects that are similar, ONLY if you actually know them, each with a one-line note on how it is similar (empty list if not; never invent names).`;
  const saturationBasis = searched
    ? "Base this on the similar results you kept: no close matches leans Fresh, a few direct matches is Crowded, many strong direct matches is Very saturated."
    : "Base this on what you know.";
  const similarShape = searched ? `[{"id": 3, "note": "..."}]` : `[{"name": "...", "note": "..."}]`;

  const extraSteps = [
    devpost &&
      `6. Built before: read the past hackathon projects from Devpost (ids D1, D2, ...). Keep ONLY projects genuinely similar to the idea or its versions. For each one you keep: its id, a one-line summary of what that project built, and how close it is to the idea: "high", "medium" or "low". Return an empty list if none are close. Then name "the twist none of them tried": one concrete twist for Brainy's pick that none of the kept projects did.`,
    arxiv &&
      `${devpost ? 7 : 6}. Papers: read the arXiv papers (ids P1, P2, ...). Keep the 3 to 5 closest to the idea (fewer if fewer are relevant, none if none are). For each: its id, "did": one line on what the paper did, and "missed": what it did not do that this idea needs. Then "gap": the specific gap Brainy's pick fills, citing papers only by these ids. Only cite papers from this list; never invent papers, authors or results. If you are unsure whether a paper is really close, or what the gap is, say so plainly in "gap" and set "confident" to false.`,
  ].filter(Boolean);
  const extraShape = [
    devpost && `"builtBefore": {"projects": [{"id": "D2", "summary": "one line", "closeness": "high" | "medium" | "low"}], "twist": "one or two sentences"}`,
    arxiv && `"papers": {"closest": [{"id": "P1", "did": "one line", "missed": "one line"}], "gap": "one or two sentences", "confident": true | false}`,
  ].filter(Boolean);

  return `You are Brainy, a brutally honest judge of ideas. You will get a user's original idea, what it is for, several AI-generated versions of it${searched ? ", and numbered results from a live search for similar existing work" : ""}${devpost ? ", past hackathon projects from Devpost" : ""}${arxiv ? ", and arXiv papers" : ""}.

Do ${5 + extraSteps.length} things:
${similarStep}
2. Saturation: judge how crowded this space already is. Pick exactly one of "Fresh", "Crowded", "Very saturated". ${saturationBasis} Give a one-line reason. Never call the idea "unique".
3. Brainy's pick: choose the single most unique-but-still-workable direction. Either take one of the versions and improve it, or propose a new angle none of them found. Say which version it is based on (its direction label) or "New angle".
4. If saturation is "Crowded" or "Very saturated", suggest 1-2 related but less crowded ideas to try instead. If "Fresh", return an empty list.
5. Follow-ups: write 3 short ideas (one sentence, under 20 words each) the user could run through Brainy next, e.g. a sharper niche of your pick, a pivot, or a risky twist. Write them as ideas, not questions to the user.
${extraSteps.join("\n")}

Respond with ONLY a JSON object, no markdown, no extra text, in exactly this shape:
{"similarExisting": ${similarShape}, "saturation": "Fresh" | "Crowded" | "Very saturated", "saturationReason": "one line", "pick": {"title": "...", "pitch": "one or two sentences", "basedOn": "direction label or New angle", "why": "one or two sentences"}, "alternatives": [{"title": "...", "pitch": "one sentence"}], "followUps": ["...", "...", "..."]${extraShape.map((x) => ", " + x).join("")}}`;
}

const SATURATION_LEVELS = ["Fresh", "Crowded", "Very saturated"] as const;

/**
 * Send the original idea, every generated version and the search results
 * to the judge model and get back Brainy's verdict.
 * `models` is tried in order (see callWithFallback).
 * Pass `results = null` when no general search source (web, GitHub) ran.
 * `special` holds Devpost / arXiv results when those searches ran (an empty
 * list = ran, found nothing); they get their own numbered lists (D1.., P1..)
 * and their own sections in the verdict.
 * Throws if the reply is unusable.
 */
export async function judgeIdea(
  models: string[],
  idea: string,
  purpose: Purpose,
  versions: Version[],
  results: SearchResult[] | null,
  { style, signal, apiKey, meter, deadline }: CallOptions = {},
  special: { devpost?: SearchResult[]; arxiv?: SearchResult[] } = {}
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

  const { devpost, arxiv } = special;
  const devpostText = !devpost
    ? ""
    : "\n\nPast hackathon projects on Devpost:\n" +
      (devpost.length === 0 ? "(none found)" : devpost.map((r, i) => `[D${i + 1}] ${r.title}\n   ${r.url}\n   ${r.snippet}`).join("\n"));
  const arxivText = !arxiv
    ? ""
    : "\n\narXiv papers:\n" +
      (arxiv.length === 0
        ? "(none found)"
        : arxiv
            .map((r, i) => `[P${i + 1}] ${r.title} (${(r.authors ?? []).slice(0, 4).join(", ")}${r.year ? `, ${r.year}` : ""})\n   ${r.snippet}`)
            .join("\n"));

  const user = `Purpose: ${label}\n\nOriginal idea:\n${idea}\n\nGenerated versions:\n${versionsText}${resultsText}${devpostText}${arxivText}`;

  // Lower temperature: we want a careful judge, not a creative one.
  const extras = { devpost: Boolean(devpost), arxiv: Boolean(arxiv) };
  const system = [judgePrompt(searched, extras), style].filter(Boolean).join(" ");
  // The verdict JSON is usually 600-1,200 tokens; 2,000 leaves room for a
  // free reasoning model's short thinking without reserving a huge budget.
  // The Devpost / arXiv sections add a few hundred more.
  // Free reasoning judges often need 40-80s for the full verdict (longer with
  // the Devpost / arXiv sections), so allow that before trying the next model.
  const extra = Boolean(devpost || arxiv);
  const settings = { temperature: 0.4, timeoutMs: extra ? 100_000 : 90_000, maxTokens: extra ? 2800 : 2000, signal, apiKey, meter, deadline };
  return callAndParse(models, system, user, settings, (text, model): BrainyTake => {
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
      ...(devpost && obj.builtBefore && { builtBefore: parseBuiltBefore(obj.builtBefore, devpost) }),
      ...(arxiv && obj.papers && { papers: parsePapers(obj.papers, arxiv) }),
    };
  });
}

// Look up "D3" / "P2" style ids in the list they refer to. Unknown or repeated ids are dropped.
function byId<T>(list: T[], prefix: string, raw: unknown, used: Set<number>): T | null {
  const n = Number(String(raw ?? "").trim().toUpperCase().replace(prefix, ""));
  if (!Number.isInteger(n) || n < 1 || n > list.length || used.has(n)) return null;
  used.add(n);
  return list[n - 1];
}

const CLOSENESS: Closeness[] = ["high", "medium", "low"];

// The judge refers to results by id ("P1 and P5 show..."). Visitors never see
// those ids, so point them at the card's own numbering ("[1] and [3]"), or
// name a result the card doesn't list by a short title.
function rewriteRefs(text: string, prefix: string, list: SearchResult[], shown: string[]) {
  return text.replace(new RegExp(`\\b${prefix}(\\d+)\\b`, "g"), (match, n) => {
    const hit = list[Number(n) - 1];
    if (!hit) return match;
    const at = shown.indexOf(hit.url);
    return at >= 0 ? `[${at + 1}]` : `“${hit.title.length > 50 ? hit.title.slice(0, 49) + "…" : hit.title}”`;
  });
}

/** The judge's Devpost picks, with titles and links taken from the real search results. */
function parseBuiltBefore(raw: { projects?: unknown; twist?: unknown }, devpost: SearchResult[]): BuiltBefore {
  const used = new Set<number>();
  const list: { id?: unknown; summary?: unknown; closeness?: unknown }[] = Array.isArray(raw.projects) ? raw.projects : [];
  const projects = list.flatMap((p) => {
    const hit = byId(devpost, "D", p?.id, used);
    if (!hit) return [];
    const closeness = CLOSENESS.includes(p.closeness as Closeness) ? (p.closeness as Closeness) : "medium";
    return [{ title: hit.title, url: hit.url, summary: isText(p.summary) ? p.summary.trim() : hit.snippet.slice(0, 160), closeness }];
  });
  projects.sort((a, b) => CLOSENESS.indexOf(a.closeness) - CLOSENESS.indexOf(b.closeness));
  const twist = isText(raw.twist) ? rewriteRefs(raw.twist.trim(), "D", devpost, projects.slice(0, 5).map((p) => p.url)) : "";
  return { found: projects.length, projects, twist };
}

/** The judge's closest papers, with titles, authors, years and links taken from arXiv itself. */
function parsePapers(raw: { closest?: unknown; gap?: unknown; confident?: unknown }, arxiv: SearchResult[]): PaperReport {
  const used = new Set<number>();
  const list: { id?: unknown; did?: unknown; missed?: unknown }[] = Array.isArray(raw.closest) ? raw.closest : [];
  const papers = list
    .flatMap((p) => {
      const hit = byId(arxiv, "P", p?.id, used);
      if (!hit || !isText(p.did)) return [];
      return [
        {
          title: hit.title,
          url: hit.url,
          authors: hit.authors ?? [],
          year: hit.year,
          did: p.did.trim(),
          missed: isText(p.missed) ? p.missed.trim() : "",
        },
      ];
    })
    .slice(0, 5);
  const gap = isText(raw.gap) ? rewriteRefs(raw.gap.trim(), "P", arxiv, papers.map((p) => p.url)) : "";
  return { papers, gap, confident: raw.confident === true };
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

// ---------- Idea breeding (see lib/lineage.ts) ----------

// What one offspring looks like before it gets an id and a place in the tree.
export type OffspringJSON = IdeaJSON & { inherits: string };

const CROSS_PROMPT = `You breed ideas. You get the user's original idea and two PARENT ideas (A and B). Produce exactly 3 OFFSPRING ideas.

Each offspring must genuinely combine the parents: take one specific, load-bearing trait from A (a customer, mechanism, business model, method, constraint or medium) and one from B, and fuse them into ONE coherent new concept that neither parent is on its own. Do not just bolt them together ("A plus B", "A with B's features"); the fused trait should change how the idea works. The 3 offspring must differ from each other: inherit different traits each time.

For each offspring write "inherits" as one line in this form: "Inherits <trait> from <parent A title>, <trait> from <parent B title>".`;

/**
 * Cross two parent ideas into 3 offspring. `models` is tried in order.
 * Throws if every call fails or the reply is unusable.
 */
export async function crossIdeas(
  models: string[],
  idea: string,
  purpose: Purpose,
  parents: [ParentIdea, ParentIdea],
  { style, maxTokens = 800, signal, apiKey, meter, deadline }: CallOptions = {}
): Promise<{ offspring: OffspringJSON[]; model: string }> {
  const { guidance, fields } = PURPOSES[purpose];
  const shape = JSON.stringify({
    offspring: [
      {
        title: "short catchy name",
        pitch: "one sentence",
        ...Object.fromEntries(fields.map((f) => [f.key, f.hint])),
        inherits: "Inherits ... from ..., ... from ...",
      },
    ],
  });
  const system = `${CROSS_PROMPT}\n\n${guidance}${style ? `\n\n${style}` : ""}\n\nRespond with ONLY a JSON object, no markdown, no extra text, in exactly this shape (3 items in "offspring"):\n${shape}`;

  const describe = (p: ParentIdea, tag: string) =>
    `Parent ${tag} [${p.label}] ${p.title}: ${p.pitch}\n` + fields.map((f) => `   ${f.label}: ${p.details[f.key] ?? ""}`).join("\n");
  const user = `Purpose: ${PURPOSES[purpose].label}\n\nOriginal idea:\n${idea}\n\n${describe(parents[0], "A")}\n\n${describe(parents[1], "B")}`;

  // Three ideas in one reply, so roughly three times one version's budget.
  const settings = { temperature: 0.9, timeoutMs: 60_000, maxTokens: Math.min(maxTokens * 3, 3600), signal, apiKey, meter, deadline };
  return callAndParse(models, system, user, settings, (text, model) => {
    const obj = extractJSON(text);
    const list: unknown[] = Array.isArray(obj.offspring) ? obj.offspring : [];

    const offspring = list.flatMap((raw): OffspringJSON[] => {
      const o = raw as Record<string, unknown>;
      const keys = ["title", "pitch", "inherits", ...fields.map((f) => f.key)];
      if (!keys.every((k) => isText(o[k]))) return [];
      return [
        {
          title: o.title as string,
          pitch: o.pitch as string,
          inherits: (o.inherits as string).trim().slice(0, 300),
          details: Object.fromEntries(fields.map((f) => [f.key, o[f.key] as string])),
        },
      ];
  });
  if (offspring.length === 0) throw new Error("No usable offspring");
  return { offspring: offspring.slice(0, 3), model };
  });
}

const GENERATION_JUDGE_PROMPT = `You are Brainy, a brutally honest judge of ideas. You get a user's original idea and a numbered set of OFFSPRING ideas bred from it. Each says what it inherits from its parents.

1. For EACH offspring, write one honest line: what's strong or weak about it.
2. Pick the single offspring most worth chasing: the most unique idea that could still work. Refer to it by its id. Explain why in one or two sentences.

Only use the ids you were given. Respond with ONLY a JSON object, no markdown, in exactly this shape:
{"notes": [{"id": "...", "note": "one line"}], "pickId": "...", "why": "one or two sentences"}`;

/**
 * Judge a set of offspring. Returns the picked id, why, and a note per offspring.
 * Ids not in the input are dropped, so the verdict can only talk about real offspring.
 */
export async function judgeOffspring(
  models: string[],
  idea: string,
  purpose: Purpose,
  offspring: (ParentIdea & { id: string; inherits: string })[],
  { style, signal, apiKey, meter, deadline }: CallOptions = {}
): Promise<{ pickId: string; why: string; notes: { id: string; note: string }[]; model: string }> {
  const { label, fields } = PURPOSES[purpose];
  const list = offspring
    .map(
      (o) =>
        `- id ${o.id}: ${o.title}: ${o.pitch}\n   ${o.inherits}\n` +
        fields.map((f) => `   ${f.label}: ${o.details[f.key] ?? ""}`).join("\n")
    )
    .join("\n\n");
  const user = `Purpose: ${label}\n\nOriginal idea:\n${idea}\n\nOffspring:\n${list}`;
  const system = [GENERATION_JUDGE_PROMPT, style].filter(Boolean).join(" ");

  const ids = new Set(offspring.map((o) => o.id));
  const settings = { temperature: 0.4, timeoutMs: 60_000, maxTokens: 1500, signal, apiKey, meter, deadline };
  return callAndParse(models, system, user, settings, (text, model) => {
    const obj = extractJSON(text);
    const pickId = String(obj.pickId ?? "");
    if (!ids.has(pickId)) throw new Error("Judge picked an unknown offspring");
    const notes = (Array.isArray(obj.notes) ? obj.notes : [])
      .filter((n: { id?: unknown; note?: unknown }) => ids.has(String(n?.id)) && isText(n?.note))
      .map((n: { id: unknown; note: string }) => ({ id: String(n.id), note: n.note.trim().slice(0, 300) }));
    return { pickId, why: isText(obj.why) ? obj.why.trim() : "", notes, model };
  });
}
