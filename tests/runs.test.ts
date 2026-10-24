// Server-side tests for a full Research run and a Cross, against mocked
// OpenRouter, Tavily and arXiv (no network, no Redis, no quota used).
// They replay the failures seen in production on 24 Oct 2026: free models
// answering 403 "only available on agentic harnesses", mixed with 404/429 and
// replies that weren't JSON. Run with `npm test`.

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import type { Lineup } from "@/lib/server/models";

// No Upstash or database: limits, the pool and health fall back to memory.
for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "DATABASE_URL"]) {
  delete process.env[k];
}
process.env.OPENROUTER_API_KEY = "sk-or-test-not-a-real-key-000000";
process.env.TAVILY_API_KEY = "tvly-test-not-a-real-key-0000";

const AGENTIC = (id: string) => `${id} is only available on agentic harnesses. Try plugging it into a coding agent`;

// ---------- The fake outside world ----------

// The free models OpenRouter lists. The two inkling ones are on the static
// denylist; "acme/gated-70b:free" is gated too but not known in advance.
const CATALOG = [
  "thinkingmachines/inkling-small:free",
  "thinkingmachines/inkling:free",
  "acme/gated-70b:free",
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
].map((id) => ({
  id,
  name: id,
  context_length: 262_144,
  pricing: { prompt: "0", completion: "0" },
  architecture: { output_modalities: ["text"] },
}));

type Behaviour = "ok" | "agentic" | "404" | "429" | "garbage";
let behaviour: Record<string, Behaviour[]> = {}; // per model, consumed one per call; then "ok"
const chatCalls: { model: string; system: string }[] = [];

const researchVersion = {
  title: "Fatigue Typing Study",
  pitch: "Measure fatigue from keystroke timing.",
  researchQuestion: "Can typing rhythm predict fatigue?",
  method: "Lab study with keystroke logging.",
  datasets: "A public keystroke dataset.",
  gap: "No phone-based fatigue models.",
};
const judgeReply = {
  similarExisting: [{ id: 1, note: "close" }],
  saturation: "Crowded",
  saturationReason: "Some prior work exists.",
  pick: { title: "Pick", pitch: "The pick.", basedOn: "Quantitative", why: "Most workable." },
  alternatives: [{ title: "Alt", pitch: "Alt pitch." }],
  followUps: ["One", "Two", "Three"],
  papers: { closest: [{ id: "P1", did: "Studied typing.", missed: "No phones." }], gap: "P1 missed phones.", confident: true },
};
const crossReply = {
  offspring: [1, 2, 3].map((n) => ({
    title: `Child ${n}`,
    pitch: "A fused idea.",
    researchQuestion: "q",
    method: "m",
    datasets: "d",
    gap: "g",
    inherits: "Inherits the method from A, the population from B",
  })),
};

function reply(system: string) {
  if (system.includes("You write search queries")) return { web: ["typing fatigue study"], keywords: ["keystroke fatigue"] };
  if (system.includes("You breed ideas")) return crossReply;
  if (system.includes("You are Brainy, a brutally honest judge")) return judgeReply;
  return researchVersion;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.includes("openrouter.ai/api/v1/models")) return json({ data: CATALOG });
  if (url.includes("openrouter.ai/api/v1/chat/completions")) {
    const body = JSON.parse(String(init?.body));
    const model: string = body.model;
    const system: string = body.messages[0].content;
    chatCalls.push({ model, system });
    const next = behaviour[model]?.shift() ?? "ok";
    if (next === "agentic") return json({ error: { message: AGENTIC(model), code: 403 } }, 403);
    if (next === "404") return json({ error: { message: "Provider returned error", code: 404 } }, 404);
    if (next === "429") return json({ error: { message: `${model} is temporarily rate-limited upstream`, code: 429 } }, 429);
    if (next === "garbage") return json({ choices: [{ message: { content: "Sure! Here is my idea, no JSON though." } }] });
    return json({ choices: [{ message: { content: JSON.stringify(reply(system)) } }] });
  }
  if (url.includes("api.tavily.com")) {
    return json({ results: [{ title: "Typing and fatigue", url: "https://example.org/typing", content: "A study." }] });
  }
  if (url.includes("export.arxiv.org")) {
    const entry = `<entry><id>http://arxiv.org/abs/2401.00001v1</id><title>Keystroke Dynamics and Fatigue</title>
      <summary>We study typing.</summary><published>2024-01-01T00:00:00Z</published><author><name>A. Researcher</name></author></entry>`;
    return new Response(`<?xml version="1.0"?><feed>${entry}</feed>`, { status: 200 });
  }
  throw new Error(`Unexpected fetch in test: ${url}`);
}) as typeof fetch;

// ---------- Helpers ----------

const quiet = console.warn;
beforeEach(() => {
  behaviour = {};
  chatCalls.length = 0;
  console.warn = () => {}; // the code logs every fallback; keep test output readable
});

async function load() {
  const [runPlan, models, run, or, guard, health] = await Promise.all([
    import("@/lib/run-plan"),
    import("@/lib/server/models"),
    import("@/lib/server/expand-run"),
    import("@/lib/openrouter"),
    import("@/lib/server/guard"),
    import("@/lib/server/health"),
  ]);
  return { runPlan, models, run, or, guard, health };
}

async function researchRun(models: Lineup) {
  const { runPlan, run } = await load();
  const { createMeter } = await import("@/lib/server/quota");
  const directions = runPlan.pickDirections("research", "quick");
  const events: { type: string; [k: string]: unknown }[] = [];
  const meter = createMeter(null);
  const failure = await run.runIdea({
    idea: "Can typing patterns on a phone detect fatigue?",
    purpose: "research",
    directions,
    plan: { size: "quick", directions: directions.map((d) => d.label), baseline: false, search: true, generators: models.generators },
    models,
    options: { maxTokens: 800, meter },
    generationDeadline: Date.now() + 60_000,
    judgeDeadline: Date.now() + 120_000,
    ownKey: false,
    send: (e) => events.push(e as never),
  });
  await meter.finish();
  return { failure, events };
}

// ---------- Tests ----------

describe("model list", () => {
  test("agentic-only inkling models are never offered", async () => {
    const { models } = await load();
    const list = await models.modelList();
    assert.ok(!list.some((m) => m.id.startsWith("thinkingmachines/inkling")), "inkling models must be filtered out");
    const l = await models.lineup({ ownKey: false });
    for (const id of [...l.generators, ...l.fallbacks, ...l.judges]) assert.ok(!id.startsWith("thinkingmachines/inkling"), id);
  });
});

describe("Research run", () => {
  test("a Quick Research run streams 3 directions, a search and a verdict with papers", async () => {
    const { models } = await load();
    const { failure, events } = await researchRun(await models.lineup({ ownKey: false }));
    assert.equal(failure, null);
    const versions = events.filter((e) => e.type === "version");
    assert.equal(versions.length, 3);
    const search = events.find((e) => e.type === "search") as { search: { ran: string[] } } | undefined;
    assert.deepEqual(search?.search.ran.sort(), ["arxiv", "web"]);
    const take = events.find((e) => e.type === "take") as { take: { papers?: { papers: unknown[] } } | null } | undefined;
    assert.ok(take?.take, "the judge should return a verdict");
    assert.equal(take.take.papers?.papers.length, 1, "the arXiv paper is cited from real results");
  });

  test("production replay: a newly gated model (403 agentic) falls back, and is denylisted for next time", async () => {
    const { models, health } = await load();
    const lineup = await models.lineup({ ownKey: false, models: ["acme/gated-70b:free"] });
    behaviour["acme/gated-70b:free"] = ["agentic", "agentic", "agentic", "agentic"];
    const { failure, events } = await researchRun(lineup);
    assert.equal(failure, null);
    assert.equal(events.filter((e) => e.type === "version").length, 3, "every direction still arrives via a fallback");
    assert.ok((await health.getDenied()).has("acme/gated-70b:free"));
    const after = await models.modelList();
    assert.ok(!after.some((m) => m.id === "acme/gated-70b:free"), "denylisted models leave the list");
  });

  test("a direction whose reply isn't JSON is retried once on a stricter prompt", async () => {
    const { models } = await load();
    const lineup = await models.lineup({ ownKey: false });
    behaviour[lineup.generators[0]] = ["garbage"];
    const { failure, events } = await researchRun(lineup);
    assert.equal(failure, null);
    assert.equal(events.filter((e) => e.type === "version").length, 3);
    assert.ok(chatCalls.some((c) => c.system.includes("IMPORTANT: a previous reply could not be used")));
  });

  test("when every model is refused, rate-limited or unusable, the run reports 'busy', not the generic error", async () => {
    const { models, guard } = await load();
    const lineup = await models.lineup({ ownKey: false });
    for (const id of new Set([...lineup.generators, ...lineup.fallbacks])) behaviour[id] = ["429", "404", "garbage", "429", "429", "429"];
    const { failure } = await researchRun(lineup);
    assert.ok(failure, "the run should fail");
    assert.equal(failure.busy, true);
    assert.equal(failure.error, "The models are busy right now, try again in a minute.");
    assert.notEqual(failure.error, guard.GENERIC_ERROR);
  });
});

describe("Cross", () => {
  const parents = [
    { label: "Quantitative", title: "A", pitch: "a", details: { researchQuestion: "q", method: "m", datasets: "d", gap: "g" } },
    { label: "Qualitative", title: "B", pitch: "b", details: { researchQuestion: "q", method: "m", datasets: "d", gap: "g" } },
  ] as const;

  test("breeds 3 offspring on the healthy chain", async () => {
    const { models, or } = await load();
    const { fallbacks } = await models.lineup({ ownKey: false });
    const r = await or.crossIdeas(models.chainFor(fallbacks[0], fallbacks), "idea", "research", [parents[0], parents[1]], { maxTokens: 800 });
    assert.equal(r.offspring.length, 3);
    assert.match(r.offspring[0].inherits, /^Inherits/);
  });

  test("production replay: a 403 'agentic harnesses' model in the chain falls back instead of failing", async () => {
    const { or } = await load();
    behaviour["acme/other-gated-70b:free"] = ["agentic"];
    const r = await or.crossIdeas(
      ["acme/other-gated-70b:free", "google/gemma-4-31b-it:free"],
      "idea",
      "research",
      [parents[0], parents[1]],
      { maxTokens: 800 }
    );
    assert.equal(r.model, "google/gemma-4-31b-it:free");
  });

  test("a cut-off reply is retried once with a stricter prompt", async () => {
    const { or } = await load();
    behaviour["google/gemma-4-31b-it:free"] = ["garbage"];
    const r = await or.crossIdeas(["google/gemma-4-31b-it:free"], "idea", "research", [parents[0], parents[1]], { maxTokens: 800 });
    assert.equal(r.offspring.length, 3);
    assert.equal(chatCalls.length, 2);
  });

  test("all models busy maps to the busy message", async () => {
    const { or, guard } = await load();
    behaviour["google/gemma-4-31b-it:free"] = ["429"];
    const err = await or
      .crossIdeas(["google/gemma-4-31b-it:free"], "idea", "research", [parents[0], parents[1]], { maxTokens: 800 })
      .catch((e: unknown) => e);
    assert.equal(guard.explainFailure([err], false).busy, true);
  });
});

process.on("exit", () => {
  console.warn = quiet;
});
