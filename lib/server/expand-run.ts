// One Brainy run, minus the HTTP parts: search and generation in parallel,
// then the judge, each piece handed to `send` the moment it's finished.
// Used by /api/expand (which owns sign-in, limits and the stream) and by the
// server tests in tests/. Server-only.

import { generateVersion, writeSearchQueries, type BrainyTake, type CallOptions, type Version } from "@/lib/openrouter";
import { PURPOSES, type Purpose } from "@/lib/purposes";
import { roundRobin } from "@/lib/run-plan";
import { explainFailure, type Failure } from "@/lib/server/guard";
import { runJudge } from "@/lib/server/judge-input";
import { chainFor, type Lineup } from "@/lib/server/models";
import { runSearches, skipAll, type SearchReport, type SearchResult } from "@/lib/search";
import type { RunPlanInfo, StreamEvent } from "@/lib/stream";

// The baseline uses a plain prompt: "what a typical AI would say".
const BASELINE_PROMPT =
  "You are a helpful assistant. Turn the user's idea into a finished concept.";

// Shared framing so every direction still produces a concrete, finished concept.
const DIRECTION_PREFIX =
  "You are a creative strategist. Turn the user's half-baked idea into a specific, finished concept. Constraint: ";

/**
 * The whole run. Sends search / baseline / version / take events as they
 * finish. Returns null when the run produced something (or was cancelled),
 * or the Failure when every direction and the baseline failed. The caller
 * then refunds the run and sends the error, so a failed run costs nothing.
 */
export async function runIdea({
  idea,
  purpose,
  directions,
  plan,
  models,
  options,
  generationDeadline,
  judgeDeadline,
  tavilyKey,
  ownKey,
  send,
}: {
  idea: string;
  purpose: Purpose;
  directions: { label: string; prompt: string }[];
  plan: RunPlanInfo;
  models: Lineup;
  options: CallOptions;
  generationDeadline: number;
  judgeDeadline: number;
  tavilyKey?: string;
  ownKey: boolean;
  send: (event: StreamEvent) => void;
}): Promise<Failure | null> {
  const { signal } = options;
  const generating = { ...options, deadline: generationDeadline };

  // 1. Search for similar existing work. This chain (write queries -> search)
  // runs at the same time as the idea generation below, so it adds little wait.
  // It never throws: if anything fails we just get fewer (or no) results.
  const sources = PURPOSES[purpose].sources;
  const searchPromise: Promise<{ results: SearchResult[]; report: SearchReport }> = (
    plan.search
      ? writeSearchQueries(chainFor(models.fallbacks[0] ?? models.generators[0], models.fallbacks), idea, purpose, generating)
          .then((queries) => runSearches(sources, queries, { tavilyKey }))
          .catch((err) => {
            console.warn("Could not write search queries:", err instanceof Error ? err.message : err);
            return { results: [], report: skipAll(sources, "couldn't write search queries") };
          })
      : Promise.resolve({ results: [], report: skipAll(sources, "turned off for this run") })
  ).then((search) => {
    send({ type: "search", search: search.report, results: search.results });
    return search;
  });

  // 2. Baseline call (optional), on the first generator.
  const baselinePromise: Promise<Version | null> = plan.baseline
    ? generateVersion(chainFor(models.generators[0], models.fallbacks), BASELINE_PROMPT, idea, purpose, generating).then(
        (result): Version => {
          const version = { ...result, direction: "Baseline" };
          send({ type: "baseline", version });
          return version;
        }
      )
    : Promise.resolve(null);

  // 3. One call per direction, spread round-robin across the chosen models.
  // Each falls back through the healthy free models if its own model fails.
  const assigned = roundRobin(directions.length, models.generators);
  const directionPromises = directions.map((d, i) =>
    generateVersion(chainFor(assigned[i], models.fallbacks, i + 1), DIRECTION_PREFIX + d.prompt, idea, purpose, generating).then(
      (result): Version => {
        const version = { ...result, direction: d.label };
        send({ type: "version", version });
        return version;
      }
    )
  );

  // Promise.allSettled waits for ALL calls and never throws,
  // so one failing model doesn't break the others.
  const [search, [baselineResult, ...directionResults]] = await Promise.all([
    searchPromise,
    Promise.allSettled([baselinePromise, ...directionPromises]),
  ]);
  if (signal?.aborted) return null;

  // 4. Keep only the calls that succeeded; log the failures for debugging.
  const versions: Version[] = [];
  for (const r of directionResults) {
    if (r.status === "fulfilled") versions.push(r.value);
    else console.warn("Skipped a version:", r.reason?.message ?? r.reason);
  }

  let baseline: Version | null = null;
  if (baselineResult.status === "fulfilled") baseline = baselineResult.value;
  else console.warn("Baseline failed:", baselineResult.reason?.message ?? baselineResult.reason);

  if (!baseline && versions.length === 0) {
    console.warn("All models failed");
    // Busy models, out of fuel, or the visitor's own key refused: a clearer note than a generic error.
    const reasons = [baselineResult, ...directionResults].flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
    return explainFailure(reasons, ownKey);
  }

  // 5. Brainy's Take, with whatever time is left. If the judge fails we still
  // keep the versions, and the page offers "Try another judge".
  let take: BrainyTake | null = null;
  try {
    const all = baseline ? [baseline, ...versions] : versions;
    take = await runJudge(models.judges, idea, purpose, all, search, { ...options, deadline: judgeDeadline });
  } catch (err) {
    console.warn("Judge failed:", err instanceof Error ? err.message : err);
  }
  send({ type: "take", take });
  return null;
}
