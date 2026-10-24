// Running Brainy's Take, shared by the main run (/api/expand) and "Try
// another judge" (/api/judge). Server-only.

import { judgeIdea, type BrainyTake, type CallOptions, type Version } from "@/lib/openrouter";
import type { Purpose } from "@/lib/purposes";
import type { SearchReport, SearchResult } from "@/lib/search";

/**
 * The judge sees the idea, every version (baseline included) and the search
 * results. Web and GitHub feed "similar things"; Devpost and arXiv get their
 * own sections (Built before, Papers), and are only passed when they ran.
 * When no general source ran, the judge falls back to its own knowledge.
 * Throws if every judge fails.
 */
export function runJudge(
  judges: string[],
  idea: string,
  purpose: Purpose,
  versions: Version[],
  search: { results: SearchResult[]; report: SearchReport },
  options: CallOptions
): Promise<BrainyTake> {
  const { ran } = search.report;
  const general = search.results.filter((r) => r.source === "web" || r.source === "github");
  const generalRan = ran.includes("web") || ran.includes("github");
  const special = {
    ...(ran.includes("devpost") && { devpost: search.results.filter((r) => r.source === "devpost") }),
    ...(ran.includes("arxiv") && { arxiv: search.results.filter((r) => r.source === "arxiv") }),
  };
  return judgeIdea(judges, idea, purpose, versions, generalRan ? general : null, options, special);
}
