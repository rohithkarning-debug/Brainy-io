"use client"; // this page uses state and click handlers, so it runs in the browser

import { useEffect, useState } from "react";
import { BrainyTakeCard } from "@/app/components/BrainyTakeCard";
import { LoadingState } from "@/app/components/LoadingState";
import { MeshGradient } from "@/app/components/MeshGradient";
import { Nav } from "@/app/components/Nav";
import { PurposePicker } from "@/app/components/PurposePicker";
import { SectionTitle } from "@/app/components/ui";
import { VersionCard } from "@/app/components/VersionCard";
import { MAX_IDEA_LENGTH, RUNS_PER_IP_PER_DAY } from "@/lib/limits";
import type { BrainyTake, Version } from "@/lib/openrouter";
import type { Purpose } from "@/lib/purposes";
import type { SearchReport } from "@/lib/search";

// Everything the API sends back, plus the purpose it was generated for
// (so cards keep the right labels if you switch purpose afterwards).
type Results = {
  purpose: Purpose;
  baseline: Version | null;
  versions: Version[];
  take: BrainyTake | null;
  search: SearchReport;
};

export default function Home() {
  const [idea, setIdea] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("startup");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  // Runs left today (null = no limits, e.g. local dev) and the friendly
  // "come back tomorrow" note shown when a limit is hit.
  const [remaining, setRemaining] = useState<number | null>(null);
  const [limitNote, setLimitNote] = useState("");

  // On page load, ask the server how many runs this visitor has left.
  useEffect(() => {
    fetch("/api/expand")
      .then((res) => res.json())
      .then((data) => setRemaining(data.remaining ?? null))
      .catch(() => {}); // not important enough to show an error
  }, []);

  // Send the idea to our API route and show the results.
  async function expandIdea() {
    setLoading(true);
    setError("");
    setLimitNote("");
    setResults(null);
    try {
      const res = await fetch("/api/expand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, purpose }),
      });
      const data = await res.json();
      if (data.remaining !== undefined) setRemaining(data.remaining);
      if (data.limitReached) {
        setLimitNote(data.error);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      setResults({ purpose, ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen">
      {/* ---------- Hero: mesh gradient, headline, input ---------- */}
      <div className="relative isolate overflow-hidden">
        <MeshGradient />

        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <Nav />

          <header className="pt-12 sm:pt-20">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-medium text-slate-700 shadow-card backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Now grounded in live search
            </span>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-7xl">
              Your idea, but{" "}
              <span className="bg-gradient-to-r from-accent via-fuchsia-500 to-orange-400 bg-clip-text text-transparent">
                not the obvious
              </span>{" "}
              version.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Paste a half-baked idea. Get a spread of genuinely different finished versions, a
              check against what already exists, and an honest verdict on which one is worth chasing.
            </p>
          </header>

          {/* Input card */}
          <div className="mt-10 max-w-3xl rounded-2xl border border-white/70 bg-white/85 p-4 shadow-lift backdrop-blur-xl sm:p-6">
            <PurposePicker value={purpose} onChange={setPurpose} disabled={loading} />

            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. an app that helps people swap houseplants"
              rows={4}
              maxLength={MAX_IDEA_LENGTH}
              className="mt-5 w-full resize-y rounded-xl border border-line bg-white p-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
            />

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs tabular-nums text-slate-400">
                {idea.length}/{MAX_IDEA_LENGTH}
              </span>
              <div className="flex items-center gap-3">
                {remaining !== null && (
                  <span className="text-xs tabular-nums text-slate-400">
                    {remaining} of {RUNS_PER_IP_PER_DAY} free runs left today
                  </span>
                )}
                <button
                  onClick={expandIdea}
                  disabled={loading || !idea.trim() || remaining === 0}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px] shadow-accent/60 transition hover:bg-accent-dark hover:shadow-[0_8px_24px_-6px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
                >
                  {loading ? "Thinking…" : "Expand idea"}
                  {!loading && (
                    <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                      →
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Loading, errors and results ---------- */}
      <main className="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
        {loading && <LoadingState purpose={purpose} />}

        {/* Daily limit reached: a calm note, not a red error */}
        {limitNote && (
          <p className="mt-10 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
            {limitNote}
          </p>
        )}

        {error && (
          <p className="mt-10 max-w-3xl rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">{error}</p>
        )}

        {results && (
          <div className="animate-rise-in mt-16 space-y-16">
            {/* Brainy's Take: the hero of the results */}
            {results.take ? (
              <BrainyTakeCard take={results.take} search={results.search} />
            ) : (
              <p className="rounded-xl border border-line bg-white p-4 text-sm text-slate-500 shadow-card">
                Brainy&apos;s Take couldn&apos;t be generated this time, but here are the versions.
              </p>
            )}

            {/* Baseline */}
            {results.baseline && (
              <section>
                <SectionTitle eyebrow="For comparison" title="What a typical AI would say" />
                <div className="max-w-xl">
                  <VersionCard version={results.baseline} purpose={results.purpose} muted />
                </div>
              </section>
            )}

            {/* The different directions */}
            {results.versions.length > 0 && (
              <section>
                <SectionTitle
                  eyebrow={`${results.versions.length} directions`}
                  title="Different takes on your idea"
                />
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {results.versions.map((v) => (
                    <VersionCard key={v.direction} version={v} purpose={results.purpose} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
