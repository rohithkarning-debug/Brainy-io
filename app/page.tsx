"use client"; // this page uses state and click handlers, so it runs in the browser

import { useEffect, useState } from "react";
import { MAX_IDEA_LENGTH, RUNS_PER_IP_PER_DAY } from "@/lib/limits";
import type { BrainyTake, SimilarThing, Version } from "@/lib/openrouter";
import { PURPOSES, PURPOSE_KEYS, SOURCE_LABELS, type Purpose, type SearchSource } from "@/lib/purposes";
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

// Soft animated mesh behind the hero: blurred blobs that fade out toward the bottom.
function MeshGradient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[780px] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
    >
      <div className="animate-drift-a absolute -left-[10%] -top-[20%] h-[520px] w-[620px] rounded-full bg-violet-400/50 blur-[100px]" />
      <div className="animate-drift-b absolute right-[-5%] -top-[15%] h-[480px] w-[560px] rounded-full bg-sky-400/45 blur-[100px]" />
      <div className="animate-drift-c absolute left-[30%] top-[10%] h-[420px] w-[520px] rounded-full bg-pink-400/40 blur-[110px]" />
      <div className="animate-drift-a absolute right-[10%] top-[30%] h-[360px] w-[440px] rounded-full bg-orange-300/45 blur-[110px] [animation-delay:-9s]" />
    </div>
  );
}

// Top bar: a small gradient mark plus the name.
function Nav() {
  return (
    <nav className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent via-fuchsia-500 to-orange-400 text-sm font-bold text-white shadow-card">
          b
        </span>
        <span className="text-lg font-semibold tracking-tight text-slate-950">brainy</span>
      </div>
      <span className="hidden rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur sm:inline">
        3 models · live search · 1 honest judge
      </span>
    </nav>
  );
}

// "Web", "Web + GitHub" etc.
function sourceList(sources: SearchSource[]) {
  return sources.map((s) => SOURCE_LABELS[s]).join(" + ");
}

// Three-way segmented control: Startup / Hackathon / Research.
// A white pill slides under the active option.
function PurposePicker({
  value,
  onChange,
  disabled,
}: {
  value: Purpose;
  onChange: (p: Purpose) => void;
  disabled: boolean;
}) {
  const index = PURPOSE_KEYS.indexOf(value);
  // Tailwind needs full class names written out, so pick from a list.
  const slide = ["translate-x-0", "translate-x-full", "translate-x-[200%]"][index];

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">What&apos;s it for?</p>
      <div role="radiogroup" aria-label="What is this idea for?" className="relative grid grid-cols-3 rounded-xl bg-slate-100 p-1">
        {/* The sliding pill */}
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-white shadow-card ring-1 ring-slate-900/5 transition-transform duration-300 ease-out ${slide}`}
        />
        {PURPOSE_KEYS.map((key) => {
          const active = key === value;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(key)}
              className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                active ? "text-slate-950" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {PURPOSES[key].label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {PURPOSES[value].tagline} · <span className="text-slate-400">searches {sourceList(PURPOSES[value].sources)}</span>
      </p>
    </div>
  );
}

// Animated loading: a sweeping bar plus a message that changes every few seconds.
// The last message stays until results arrive.
function LoadingState({ purpose }: { purpose: Purpose }) {
  const sources = PURPOSES[purpose].sources;
  const steps = [
    "Writing search queries…",
    "Searching the web…",
    ...(sources.includes("github") ? ["Searching GitHub…"] : []),
    ...(sources.includes("arxiv") ? ["Searching arXiv…"] : []),
    "Asking 3 models…",
    "Pushing your idea in 9 directions…",
    "Finding rare angles…",
    "Checking how crowded this space is…",
    "Judging…",
    "Brainy is picking a winner…",
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 3000);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="mt-16 flex flex-col items-center gap-5 py-10 text-center" aria-live="polite">
      <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-200">
        <div className="animate-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-fuchsia-500" />
      </div>
      {/* key={step} remounts the text so the rise-in animation replays */}
      <p key={step} className="animate-rise-in text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {steps[step]}
      </p>
      <p className="text-sm text-slate-500">This usually takes 20–60 seconds.</p>
    </div>
  );
}

// Colors for the saturation badge.
const SATURATION_STYLES: Record<BrainyTake["saturation"], string> = {
  Fresh: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Crowded: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "Very saturated": "bg-rose-50 text-rose-700 ring-rose-600/20",
};

// The big highlighted verdict card at the top of the results.
function BrainyTakeCard({ take, search }: { take: BrainyTake; search: SearchReport }) {
  const searched = search.ran.length > 0;

  return (
    // Outer div is a 1px gradient "border" around the inner panel.
    <section className="rounded-3xl bg-gradient-to-br from-accent/70 via-fuchsia-400/50 to-orange-300/60 p-px shadow-hero">
      <div className="rounded-[calc(1.5rem-1px)] bg-white p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-accent">Brainy&apos;s Take</p>
            <h2 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl">
              The verdict
            </h2>
          </div>
          <span className="font-mono text-xs text-slate-400">judged by {take.model}</span>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-5 lg:gap-10">
          {/* Left: Brainy's pick, the most prominent part */}
          <div className="rounded-2xl bg-gradient-to-br from-accent/[0.07] via-fuchsia-500/[0.04] to-transparent p-6 ring-1 ring-accent/15 sm:p-8 lg:col-span-3">
            <div className="flex flex-wrap items-center gap-2">
              <Label>Brainy&apos;s pick</Label>
              <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-white">
                {take.pick.basedOn}
              </span>
            </div>
            <h3 className="mt-4 text-2xl font-semibold leading-tight tracking-[-0.02em] text-slate-950 sm:text-3xl">
              {take.pick.title}
            </h3>
            <p className="mt-3 text-lg leading-relaxed text-slate-700">{take.pick.pitch}</p>
            {take.pick.why && (
              <p className="mt-5 border-l-2 border-accent pl-4 text-sm leading-relaxed text-slate-600">
                {take.pick.why}
              </p>
            )}
          </div>

          {/* Right: saturation verdict + similar things */}
          <div className="lg:col-span-2">
            <Label>Saturation</Label>
            <span
              className={`mt-2 inline-block rounded-full px-3.5 py-1 text-base font-semibold ring-1 ring-inset ${SATURATION_STYLES[take.saturation]}`}
            >
              {take.saturation}
            </span>
            <p className="mt-3 leading-relaxed text-slate-700">{take.saturationReason}</p>

            <div className="mt-7">
              <Label>Similar things that already exist</Label>
              {take.similarExisting.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {take.similarExisting.map((thing) => (
                    <SimilarItem key={thing.url ?? thing.title} thing={thing} />
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {searched
                    ? "No close matches found in our search."
                    : "None came to mind, but no live search ran, so check yourself."}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Less crowded alternatives (only when the idea is saturated) */}
        {take.alternatives.length > 0 && (
          <div className="mt-10 border-t border-line pt-8">
            <Label>Less crowded ideas to try instead</Label>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {take.alternatives.map((a) => (
                <div
                  key={a.title}
                  className="rounded-xl border border-line bg-white p-5 shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                >
                  <h4 className="font-semibold tracking-tight text-slate-950">{a.title}</h4>
                  <p className="mt-1 text-sm leading-relaxed text-slate-600">{a.pitch}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <SearchNote search={search} />
      </div>
    </section>
  );
}

// One "similar thing": a real link when it came from search, plain text otherwise.
function SimilarItem({ thing }: { thing: SimilarThing }) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium leading-snug text-slate-900 group-hover:text-accent">{thing.title}</span>
        {thing.url && (
          <span aria-hidden className="mt-0.5 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-accent">
            ↗
          </span>
        )}
      </div>
      {thing.url && (
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
          {thing.source && (
            <span className="rounded bg-slate-100 px-1.5 py-px font-medium text-slate-600">
              {SOURCE_LABELS[thing.source]}
            </span>
          )}
          <span className="truncate">{hostname(thing.url)}</span>
        </p>
      )}
      {thing.note && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{thing.note}</p>}
    </>
  );

  return (
    <li>
      {thing.url ? (
        <a
          href={thing.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group block rounded-xl border border-line p-3.5 transition hover:border-accent/30 hover:bg-slate-50/80"
        >
          {body}
        </a>
      ) : (
        <div className="rounded-xl border border-line p-3.5">{body}</div>
      )}
    </li>
  );
}

// Footer line: which sources were searched/skipped, or the "AI estimate"
// disclaimer when no search ran at all.
function SearchNote({ search }: { search: SearchReport }) {
  const skipped = search.skipped.map((s) => `${SOURCE_LABELS[s.source]} (${s.reason})`).join(", ");

  if (search.ran.length === 0) {
    return (
      <p className="mt-8 rounded-xl bg-amber-50 p-4 text-xs leading-relaxed text-amber-800 ring-1 ring-inset ring-amber-600/15">
        ⚠ Live search didn&apos;t run{skipped && `: skipped ${skipped}`}. This verdict is the AI&apos;s
        estimate from what it already knows. It is <strong>not</strong> a verified market or
        literature search, so do your own check before committing.
      </p>
    );
  }

  return (
    <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-line pt-5 text-xs text-slate-500">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Grounded in live search: {sourceList(search.ran)}
      </span>
      {skipped && <span className="text-amber-700">· Skipped {skipped}</span>}
    </p>
  );
}

// "https://www.example.com/x" -> "example.com"
function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// One card showing a single version of the idea, with fields for its purpose.
function VersionCard({
  version,
  purpose,
  muted = false,
}: {
  version: Version;
  purpose: Purpose;
  muted?: boolean;
}) {
  return (
    <article
      className={`flex h-full flex-col gap-3 rounded-2xl border p-6 transition duration-200 ${
        muted
          ? "border-dashed border-slate-300 bg-slate-50/60"
          : "border-line bg-white shadow-card hover:-translate-y-1 hover:shadow-lift"
      }`}
    >
      {/* Direction label + model name */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`rounded-full px-2.5 py-1 font-semibold ${
            muted ? "bg-slate-200/70 text-slate-600" : "bg-accent/10 text-accent"
          }`}
        >
          {version.direction}
        </span>
        <span className="break-all font-mono text-slate-400">{version.model}</span>
      </div>

      <h3 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950">{version.title}</h3>
      <p className="leading-relaxed text-slate-600">{version.pitch}</p>

      <dl className="mt-auto space-y-3 border-t border-line pt-4 text-sm">
        {PURPOSES[purpose].fields.map((f) => (
          <div key={f.key}>
            <dt className="text-xs font-medium text-slate-400">{f.label}</dt>
            <dd className="mt-0.5 leading-relaxed text-slate-700">{version.details[f.key]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

// Small helpers to keep headings consistent.
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">{title}</h2>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</p>;
}
