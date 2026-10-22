// Live search: finds things that already exist so Brainy's Take is grounded
// in real results instead of the judge's memory.
//   - Web:    Tavily (needs TAVILY_API_KEY)
//   - GitHub: repository search (works without a key; GITHUB_TOKEN raises the rate limit)
//   - Devpost: past hackathon projects, found through Tavily limited to
//              devpost.com (Devpost has no public API, and we never scrape it)
//   - arXiv:  the official export API, no key; throttled and cached (see searchArxiv)
// Every source is optional: if one fails we note why and carry on without it.
// Server-only.

import { createHash } from "node:crypto";
import { SOURCE_LABELS, type SearchSource } from "@/lib/purposes";
import { redis } from "@/lib/ratelimit";

export type SearchResult = {
  source: SearchSource;
  title: string;
  url: string;
  snippet: string;
  authors?: string[]; // arXiv only
  year?: number; // arXiv only
};

// What the page needs to know about how the search went.
export type SearchReport = {
  ran: SearchSource[]; // sources that answered (even with zero results)
  skipped: { source: SearchSource; reason: string }[];
};

// Search queries written by a cheap model (see writeSearchQueries).
// `web` are natural-language queries, `keywords` are short phrases that
// work better on GitHub and arXiv's keyword search.
export type SearchQueries = { web: string[]; keywords: string[] };

const PER_SOURCE = 5; // keep only the top few results from each source
// Devpost and arXiv feed their own cards, so the judge gets a few more to choose from.
const PER_SPECIAL_SOURCE = 8;
const TIMEOUT_MS = 15_000;

/**
 * Run every source for this purpose at the same time.
 * Never throws: failed sources end up in `report.skipped`.
 */
export async function runSearches(
  sources: SearchSource[],
  queries: SearchQueries,
  { tavilyKey }: { tavilyKey?: string } = {}
): Promise<{ results: SearchResult[]; report: SearchReport }> {
  const fetchers: Record<SearchSource, () => Promise<SearchResult[]>> = {
    web: () => searchWeb(queries.web, tavilyKey),
    devpost: () => searchDevpost(queries.web, tavilyKey),
    github: () => searchGitHub(queries.keywords),
    arxiv: () => searchArxiv(queries.keywords),
  };

  const settled = await Promise.allSettled(sources.map((s) => fetchers[s]()));

  const results: SearchResult[] = [];
  const report: SearchReport = { ran: [], skipped: [] };
  settled.forEach((r, i) => {
    const source = sources[i];
    if (r.status === "fulfilled") {
      report.ran.push(source);
      results.push(...r.value);
    } else {
      const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.warn(`${SOURCE_LABELS[source]} search skipped:`, reason);
      report.skipped.push({ source, reason: shortReason(reason) });
    }
  });
  return { results, report };
}

/** Mark every source as skipped, e.g. when we couldn't write queries at all. */
export function skipAll(sources: SearchSource[], reason: string): SearchReport {
  return { ran: [], skipped: sources.map((source) => ({ source, reason })) };
}

// ---------- Web and Devpost (Tavily) ----------
// Docs: https://docs.tavily.com/documentation/api-reference/endpoint/search
// `userKey` is the visitor's own Tavily key: used for this request only, and
// if it's refused we say so rather than quietly using the server's key.
type TavilyHit = { title: string; url: string; content: string; score: number };

async function tavily(queries: string[], userKey: string | undefined, extra: Record<string, unknown>): Promise<TavilyHit[]> {
  const apiKey = userKey ?? process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");
  if (queries.length === 0) throw new Error("no queries");

  // One request per query, all in parallel. "basic" depth costs 1 credit each.
  const settled = await Promise.allSettled(
    queries.map(async (query) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query, search_depth: "basic", topic: "general", max_results: PER_SOURCE, ...extra }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (userKey && (res.status === 401 || res.status === 403)) throw new Error("your Tavily key was rejected");
      if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`);
      const data = await res.json();
      return (data.results ?? []) as TavilyHit[];
    })
  );

  // If every query failed, treat the whole source as failed.
  const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;

  // Merge all queries' results, highest relevance first.
  return ok.flat().sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

async function searchWeb(queries: string[], userKey?: string): Promise<SearchResult[]> {
  const hits = await tavily(queries, userKey, {});
  return topUnique(hits.map((r) => ({ source: "web", title: r.title, url: r.url, snippet: r.content ?? "" })));
}

// Past hackathon projects: Tavily's index, limited to devpost.com (the same as
// a "site:devpost.com" search). Only project pages (/software/...) count, not
// hackathon listings or profiles. At most 3 queries, 1 credit each.
async function searchDevpost(queries: string[], userKey?: string): Promise<SearchResult[]> {
  const hits = await tavily(queries.slice(0, 3), userKey, { include_domains: ["devpost.com"], max_results: PER_SPECIAL_SOURCE });
  const projects = hits.filter((r) => /^https?:\/\/(www\.)?devpost\.com\/software\//i.test(r.url));
  return topUnique(
    projects.map((r) => ({
      source: "devpost",
      // Devpost titles look like "Project name | Devpost"
      title: r.title.replace(/\s*[|·-]\s*Devpost\s*$/i, "").trim(),
      url: r.url.split("?")[0],
      snippet: r.content ?? "",
    })),
    PER_SPECIAL_SOURCE
  );
}

// ---------- GitHub repositories ----------
// Docs: https://docs.github.com/en/rest/search/search#search-repositories
// Without a token GitHub allows only 10 searches/minute, so we send at most 2.
async function searchGitHub(keywords: string[]): Promise<SearchResult[]> {
  if (keywords.length === 0) throw new Error("no queries");

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Brainy", // GitHub rejects requests without one
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const settled = await Promise.allSettled(
    keywords.slice(0, 2).map(async (q) => {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&per_page=${PER_SOURCE}`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (res.status === 403 || res.status === 429) throw new Error("GitHub rate limit hit");
      if (!res.ok) throw new Error(`GitHub HTTP ${res.status}`);
      const data = await res.json();
      return (data.items ?? []) as {
        full_name: string;
        html_url: string;
        description: string | null;
        stargazers_count: number;
      }[];
    })
  );

  const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  if (ok.length === 0) throw (settled[0] as PromiseRejectedResult).reason;

  // Take results in turns from each query so both are represented.
  return topUnique(
    interleave(ok).map((repo) => ({
      source: "github",
      title: repo.full_name,
      url: repo.html_url,
      snippet: `${repo.description ?? "No description"} (★ ${repo.stargazers_count})`,
    }))
  );
}

// ---------- arXiv ----------
// Docs: https://info.arxiv.org/help/api/user-manual.html
// arXiv asks for no more than one request every 3 seconds, so:
//   - ONE request per search, ORing the keyword phrases;
//   - a shared 3-second slot (a Redis lock, so it holds across serverless
//     instances; in-memory when Redis isn't set up);
//   - answers cached for 24 hours, so the same question never asks twice.
const ARXIV_GAP_MS = 3_000;
const ARXIV_WAIT_MS = 12_000; // give up on a slot after this long and skip arXiv
const ARXIV_CACHE_SECONDS = 24 * 60 * 60;
const ARXIV_RESULTS = 6; // the judge keeps the 3-5 closest

let lastArxivCall = 0; // in-memory fallback for the slot
const memoryCache = new Map<string, { at: number; results: SearchResult[] }>();

// Wait for our turn: at most one arXiv request per 3 seconds, across instances.
async function arxivSlot() {
  const deadline = Date.now() + ARXIV_WAIT_MS;
  while (Date.now() < deadline) {
    if (redis) {
      // SET NX PX: only one caller gets the key; it expires after the gap.
      if (await redis.set("brainy:arxiv:slot", "1", { nx: true, px: ARXIV_GAP_MS })) return;
    } else if (Date.now() - lastArxivCall >= ARXIV_GAP_MS) {
      lastArxivCall = Date.now();
      return;
    }
    await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
  }
  throw new Error("arXiv rate limit: no free slot");
}

async function cached(key: string): Promise<SearchResult[] | null> {
  if (redis) {
    try {
      return (await redis.get<SearchResult[]>(key)) ?? null;
    } catch {
      return null; // a cache miss is fine
    }
  }
  const hit = memoryCache.get(key);
  return hit && Date.now() - hit.at < ARXIV_CACHE_SECONDS * 1000 ? hit.results : null;
}

async function remember(key: string, results: SearchResult[]) {
  if (redis) await redis.set(key, results, { ex: ARXIV_CACHE_SECONDS }).catch(() => {});
  else memoryCache.set(key, { at: Date.now(), results });
}

async function searchArxiv(keywords: string[]): Promise<SearchResult[]> {
  // "graph neural networks" -> (all:graph AND all:neural AND all:networks)
  const groups = keywords
    .map((k) => k.replace(/[^\p{L}\p{N}\s-]/gu, " ").split(/\s+/).filter(Boolean))
    .filter((words) => words.length > 0)
    .map((words) => `(${words.map((w) => `all:${w}`).join(" AND ")})`);
  if (groups.length === 0) throw new Error("no queries");

  const url =
    "https://export.arxiv.org/api/query?" +
    new URLSearchParams({
      search_query: groups.join(" OR "),
      max_results: String(ARXIV_RESULTS),
      sortBy: "relevance",
    });
  const cacheKey = "brainy:arxiv:" + createHash("sha1").update(url).digest("hex");
  const hit = await cached(cacheKey);
  if (hit) return hit;

  await arxivSlot();
  const res = await fetch(url, {
    headers: { "User-Agent": "Brainy (https://brainy-io.vercel.app)" },
    signal: AbortSignal.timeout(20_000), // arXiv can be slow
  });
  if (res.status === 429 || res.status === 503) throw new Error("arXiv rate limit hit");
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  const xml = await res.text();

  // The reply is Atom XML. Each paper sits in an <entry>; we pull out its id
  // (the abstract URL), title, summary, authors and year with simple regexes.
  const entries = xml.split("<entry>").slice(1);
  const results = topUnique(
    entries.map((entry) => ({
      source: "arxiv" as const,
      title: cleanXml(tag(entry, "title")),
      url: tag(entry, "id").trim().replace(/^http:/, "https:"),
      snippet: cleanXml(tag(entry, "summary")),
      authors: [...entry.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/g)].map((m) => cleanXml(m[1])).slice(0, 12),
      year: Number(tag(entry, "published").slice(0, 4)) || undefined,
    })),
    ARXIV_RESULTS,
    450 // abstracts: enough for the judge to say what each paper did, short enough to keep it quick
  );
  await remember(cacheKey, results);
  return results;
}

// ---------- small helpers ----------

// Text inside the first <name>...</name> in the string, or "".
function tag(xml: string, name: string) {
  return xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
}

// Decode the few XML entities arXiv uses and squash whitespace.
function cleanXml(text: string) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

// [[a1,a2],[b1,b2]] -> [a1,b1,a2,b2]
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) {
    for (const list of lists) if (list[i]) out.push(list[i]);
  }
  return out;
}

// Drop duplicates and empty entries, trim long snippets, keep the top few.
function topUnique(results: SearchResult[], limit = PER_SOURCE, snippetLength = 300): SearchResult[] {
  const seen = new Set<string>();
  return results
    .filter((r) => r.title && r.url && !seen.has(r.url) && seen.add(r.url))
    .slice(0, limit)
    .map((r) => ({ ...r, snippet: r.snippet.slice(0, snippetLength) }));
}

// Turn low-level errors into something short enough to show users.
function shortReason(message: string) {
  if (/timeout|aborted/i.test(message)) return "timed out";
  if (/is not set/i.test(message)) return "no API key";
  if (/rate limit/i.test(message)) return "rate limited";
  if (/key was rejected/i.test(message)) return "your Tavily key was rejected";
  return "unavailable";
}
