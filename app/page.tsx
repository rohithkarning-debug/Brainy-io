import Link from "next/link";
import { ExampleResult } from "@/app/components/ExampleResult";
import { Kbd, SectionTitle } from "@/app/components/ui";

// What a run does, in three cards under the hero.
const FEATURES = [
  {
    eyebrow: "9 directions · 3 models",
    title: "Not the obvious version",
    body: "Your idea gets pushed in nine deliberately different directions, spread across three models, next to a plain baseline for comparison.",
  },
  {
    eyebrow: "Web · GitHub · arXiv",
    title: "Checked against reality",
    body: "A live search looks for products, repos and papers that already do this, so you know what you're up against.",
  },
  {
    eyebrow: "1 honest judge",
    title: "A verdict, not a pep talk",
    body: "A separate judge model reads everything and tells you how crowded the space is, and which direction is worth chasing.",
  },
];

export default function Home() {
  return (
    <>
      {/* ---------- Hero ---------- */}
      <header className="pt-12 sm:pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-surface/70 bg-surface/60 px-3 py-1 text-xs font-medium text-slate-700 shadow-card backdrop-blur">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Now grounded in live search
        </span>
        <h1 className="mt-6 max-w-4xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] text-slate-950 sm:text-7xl">
          Your idea, but not the{" "}
          <span className="text-transparent [-webkit-text-stroke:1.5px_var(--color-slate-950)]">obvious</span>{" "}
          version.
        </h1>
        <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
          Paste a half-baked idea. Get a spread of genuinely different finished versions, a
          check against what already exists, and an honest verdict on which one is worth chasing.
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-3">
          <Link
            href="/ask"
            className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark hover:shadow-lift"
          >
            Start cooking
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
          <Link
            href="/about"
            className="inline-flex items-center rounded-full border border-slate-950 bg-surface px-6 py-3 text-sm font-semibold text-slate-950 shadow-card transition hover:bg-slate-50"
          >
            How it works
          </Link>
          {/* Keyboard hint: hidden on phones and other touch-first devices */}
          <span className="hidden text-xs text-slate-400 sm:inline [@media(pointer:coarse)]:hidden">
            or press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> anywhere
          </span>
        </div>
      </header>

      {/* ---------- What you get ---------- */}
      <section aria-label="What you get" className="mt-24 grid gap-5 sm:grid-cols-3">
        {FEATURES.map((f, i) => (
          <article
            key={f.title}
            className="animate-rise-in rounded-2xl border border-line bg-surface p-6 shadow-card transition duration-200 hover:-translate-y-1 hover:shadow-lift"
            style={{ animationDelay: `${0.1 + i * 0.08}s` }}
          >
            <p className="text-xs font-semibold text-accent">{f.eyebrow}</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.02em] text-slate-950">{f.title}</h2>
            <p className="mt-2 leading-relaxed text-slate-600">{f.body}</p>
          </article>
        ))}
      </section>

      {/* ---------- A finished sample, so visitors see the result before signing in ---------- */}
      <section aria-labelledby="example-heading" className="mt-24">
        <div id="example-heading">
          <SectionTitle eyebrow="See an example" title="One idea, fully cooked" />
        </div>
        <p className="-mt-3 max-w-xl leading-relaxed text-slate-600">
          A real-shaped run for a startup idea: the verdict, nine directions and the plain baseline. Click through
          the tabs.
        </p>
        <ExampleResult />
        <div className="mt-8 flex justify-center">
          <Link
            href="/ask"
            className="inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark hover:shadow-lift"
          >
            Cook your own idea <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  );
}
