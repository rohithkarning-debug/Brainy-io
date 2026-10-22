import type { Metadata } from "next";
import Link from "next/link";
import { Kbd } from "@/app/components/ui";
import { RUNS_PER_USER_PER_DAY } from "@/lib/limits";

export const metadata: Metadata = { title: "About" };

const STEPS = [
  {
    title: "You drop in a half-baked idea",
    body: "Pick what it's for (a startup, a hackathon project, or research), since that changes what a finished version looks like.",
  },
  {
    title: "Nine directions, three models",
    body: "Each direction pushes the idea somewhere specific: a different customer, the opposite market, a hardware hack, a benchmark. A plain baseline shows what a typical AI would have said.",
  },
  {
    title: "A live search for what already exists",
    body: "At the same time, Brainy searches the web, GitHub and arXiv (depending on the purpose) for products, repos and papers that already do this.",
  },
  {
    title: "One honest judge",
    body: "A stronger model reads every version and the search results, rates how crowded the space is, and picks the most unique idea that could still work.",
  },
];

const SHORTCUTS: [React.ReactNode, string][] = [
  [<><Kbd>Ctrl</Kbd> / <Kbd>⌘</Kbd> + <Kbd>K</Kbd></>, "Jump to the idea box from anywhere"],
  [<Kbd key="enter">Enter</Kbd>, "Send your idea"],
  [<><Kbd>Shift</Kbd> + <Kbd>Enter</Kbd></>, "New line in the idea box"],
  [<><Kbd>←</Kbd> <Kbd>→</Kbd></>, "Move between result tabs"],
];

export default function AboutPage() {
  return (
    <div className="max-w-3xl pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">About</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950">How Brainy cooks</h1>

      <ol className="mt-10 space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
              {i + 1}
            </span>
            <div>
              <h2 className="font-semibold tracking-tight text-slate-950">{step.title}</h2>
              <p className="mt-1 leading-relaxed text-slate-600">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Good to know</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-slate-600">
          <li>Every signed-in account gets {RUNS_PER_USER_PER_DAY} free runs a day. Regenerating counts as a run.</li>
          <li>
            Your history, saved results and settings are stored in this browser only. A result link opens on the
            device that made it.
          </li>
          <li>The verdict is an informed opinion, not a market study. Do your own check before betting on it.</li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Keyboard shortcuts</h2>
        <dl className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {SHORTCUTS.map(([keys, action]) => (
            <div key={action} className="flex items-center justify-between gap-4 px-5 py-3.5 text-sm">
              <dt className="text-slate-600">{action}</dt>
              <dd className="shrink-0">{keys}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Link
        href="/ask"
        className="mt-14 inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px] shadow-accent/60 transition hover:bg-accent-dark"
      >
        Try it <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
