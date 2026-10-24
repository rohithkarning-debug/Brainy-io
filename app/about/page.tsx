import type { Metadata } from "next";
import Link from "next/link";
import { Kbd } from "@/app/components/ui";
import { REJUDGES_PER_USER_PER_DAY, RUNS_PER_USER_PER_DAY } from "@/lib/limits";
import { RUN_SIZES, RUN_SIZE_KEYS, defaultBaseline, estimateCalls } from "@/lib/run-plan";
import { GLOBAL_DAILY_CALLS } from "@/lib/server/quota";

export const metadata: Metadata = { title: "About" };

const STEPS = [
  {
    title: "You drop in a half-baked idea",
    body: "Pick what it's for (a startup, a hackathon project, or research), since that changes what a finished version looks like.",
  },
  {
    title: "Up to nine directions, spread across models",
    body: "Each direction pushes the idea somewhere specific: a different customer, the opposite market, a hardware hack, a benchmark. You choose how many (3, 6 or 9), and an optional plain baseline shows what a typical AI would have said.",
  },
  {
    title: "A live search for what already exists",
    body: "At the same time, Brainy searches the web, GitHub, past hackathon projects on Devpost and papers on arXiv (depending on the purpose) for things that already do this.",
  },
  {
    title: "One judge, a straight verdict",
    body: "A judge model (Auto picks a healthy one, or choose your own) reads every version and the search results, rates how crowded the space is, and picks the most unique idea that could still work.",
  },
  {
    title: "Prior work, for hackathons and research",
    body: "Hackathon ideas get a \"Built before\" card: how many similar Devpost projects we found, the closest few, and the twist none of them tried. Research ideas get the closest arXiv papers, what each didn't do, and the gap your idea fills. Only real search results are cited.",
  },
  {
    title: "Breed the best ones",
    body: "Pick any two directions and cross them into three offspring that fuse a trait from each. Keep crossing for new generations, watch the family tree grow on the Lineage tab, and ask the judge to rank a generation.",
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
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Run size, models and judge</h2>
        <p className="mt-3 leading-relaxed text-slate-600">
          Open <strong>Advanced</strong> on the Ask page to set these. Your choices are remembered, and run size also
          lives in Settings.
        </p>
        <div className="mt-4 overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-3 font-semibold">Size</th>
                <th className="px-5 py-3 font-semibold">Directions</th>
                <th className="px-5 py-3 font-semibold">Model requests</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-slate-600">
              {RUN_SIZE_KEYS.map((k) => (
                <tr key={k}>
                  <td className="px-5 py-3 font-medium text-slate-950">{RUN_SIZES[k].label}</td>
                  <td className="px-5 py-3 tabular-nums">{RUN_SIZES[k].directions}</td>
                  <td className="px-5 py-3 tabular-nums">
                    ~{estimateCalls({ size: k, baseline: defaultBaseline(k), search: true })}
                    {defaultBaseline(k) && " (with baseline)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-slate-600">
          <li>
            Each direction, the baseline, the search-query writer and the judge is one model request. Searching the web,
            GitHub, Devpost and arXiv doesn&apos;t use model requests. Turning off the baseline or live search saves one
            each. If a model fails and Brainy falls back to another, that costs one more.
          </li>
          <li>
            Quick is the default on Brainy&apos;s shared free requests. Full is the default on your own key.
          </li>
          <li>
            <strong>Models:</strong> Brainy loads OpenRouter&apos;s live list of free models and leaves out ones too small
            or too short on context to do the job. Pick 1 to 4, and the directions are shared between them in turn. Auto
            picks 3. A model that just got rate-limited or timed out is marked busy (amber dot) for about 10 minutes,
            and Auto skips it.
          </li>
          <li>
            <strong>Judge:</strong> Auto tries the best healthy free judge first, then the next one. You can also pick
            any listed model; larger context helps it read every direction and search result. The judge always gets
            the last part of the run&apos;s time budget, so slow directions can&apos;t squeeze it out.
          </li>
          <li>
            If the verdict still fails, <strong>Try another judge</strong> re-runs only the judge on the directions and
            search results you already have. It doesn&apos;t count as a run ({REJUDGES_PER_USER_PER_DAY} a day).
          </li>
          <li>
            With your own OpenRouter key you can also pick paid models, shown with their price per million tokens and
            billed to your key.
          </li>
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950">Good to know</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-slate-600">
          <li>
            Every signed-in account gets {RUNS_PER_USER_PER_DAY} free runs a day. Regenerating, crossing two ideas and
            judging a generation each count as a run.
          </li>
          <li>
            Free runs also share one daily tank of model requests across everyone ({GLOBAL_DAILY_CALLS} a day, reset
            at midnight UTC). The Ask page shows how many are left. A run is only started if the tank can cover it;
            if it runs dry anyway, you keep whatever finished.
          </li>
          <li>
            Out of free runs? Add your own free OpenRouter key in{" "}
            <Link href="/settings#api-keys" className="font-medium text-slate-950 underline underline-offset-2">
              Settings
            </Link>
            . It stays in this browser, and runs on it don&apos;t touch your free runs or the shared tank.
          </li>
          <li>
            Your history, saved results, family trees and settings stay in this browser unless you turn on{" "}
            <Link href="/settings#sync" className="font-medium text-slate-950 underline underline-offset-2">
              sync
            </Link>
            , which keeps a copy on your account so they follow you to other devices. You can also make a synced
            result public as a read-only link. Your API keys never leave this browser.
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
        className="mt-14 inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark"
      >
        Try it <span aria-hidden>→</span>
      </Link>
    </div>
  );
}
