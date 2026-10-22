import { Label } from "@/app/components/ui";
import { hostname } from "@/lib/format";
import type { BuiltBefore, Closeness, PaperReport } from "@/lib/openrouter";
import type { SearchReport } from "@/lib/search";

// Cards under the verdict that show prior work for one purpose:
//   Hackathon -> "Built before": similar past projects on Devpost
//   Research  -> "Papers that almost did this": the closest arXiv papers
// Every title and link here came from a real search result, never the model.

const CLOSENESS_STYLES: Record<Closeness, string> = {
  high: "bg-rose-50 text-rose-700 ring-rose-600/20",
  medium: "bg-amber-50 text-amber-700 ring-amber-600/20",
  low: "bg-slate-100 text-slate-600 ring-slate-400/20",
};

function Shell({ eyebrow, title, children, footer }: { eyebrow: string; title: string; children: React.ReactNode; footer: string }) {
  return (
    <section className="mt-6 rounded-3xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950">{title}</h2>
      {children}
      <p className="mt-6 border-t border-line pt-4 text-xs text-slate-500">{footer}</p>
    </section>
  );
}

// The highlighted takeaway at the bottom of each card.
function Takeaway({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-6 rounded-2xl bg-accent/[0.06] p-5 ring-1 ring-accent/15">
      <Label>{label}</Label>
      <div className="mt-2 leading-relaxed text-slate-800">{children}</div>
    </div>
  );
}

// "[2]": how the twist and the gap refer to an item in the list.
function RefNumber({ n }: { n: number }) {
  return <span className="mr-1.5 font-mono text-xs text-slate-400">[{n}]</span>;
}

function ExternalTitle({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="group inline font-semibold leading-snug text-slate-950 hover:text-accent">
      {children}{" "}
      {/* U+FE0E keeps the arrow a plain glyph instead of an emoji */}
      <span aria-hidden className="text-slate-400 group-hover:text-accent">
        {"\u2197\uFE0E"}
      </span>
      <span className="sr-only">(opens {hostname(url)} in a new tab)</span>
    </a>
  );
}

/** Hackathon: similar projects already on Devpost, and the twist none of them tried. */
export function BuiltBeforeCard({ built, search }: { built?: BuiltBefore; search: SearchReport | null }) {
  const skipped = search?.skipped.find((s) => s.source === "devpost");
  if (!built) {
    if (!skipped) return null;
    return (
      <Shell eyebrow="Already built at a hackathon?" title="Built before" footer="Searched Devpost through Tavily.">
        <p className="mt-3 text-sm text-slate-600">Devpost couldn&apos;t be searched this time ({skipped.reason}).</p>
      </Shell>
    );
  }

  const shown = built.projects.slice(0, 5);
  return (
    <Shell
      eyebrow="Already built at a hackathon?"
      title="Built before"
      footer="Searched Devpost project pages through Tavily. A search can miss projects, so treat this as a starting point."
    >
      {built.found === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-slate-700">
          <span aria-hidden className="h-2 w-2 rounded-full bg-emerald-500" />
          No close matches found, which is a good sign.
        </p>
      ) : (
        <>
          <p className="mt-3 text-slate-700">
            We found {built.found} similar hackathon project{built.found === 1 ? "" : "s"} on Devpost
            {built.found > shown.length && `. Here are the ${shown.length} closest`}.
          </p>
          <ul className="mt-5 space-y-3">
            {shown.map((p, i) => (
              <li key={p.url} className="rounded-2xl border border-line p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span>
                    <RefNumber n={i + 1} />
                    <ExternalTitle url={p.url}>{p.title}</ExternalTitle>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${CLOSENESS_STYLES[p.closeness]}`}>
                    {p.closeness.charAt(0).toUpperCase() + p.closeness.slice(1)} match
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.summary}</p>
              </li>
            ))}
          </ul>
        </>
      )}
      {built.twist && <Takeaway label="The twist none of them tried">{built.twist}</Takeaway>}
    </Shell>
  );
}

// "Ada Lovelace, Alan Turing, Grace Hopper et al."
function authorLine(authors: string[]) {
  if (authors.length === 0) return "";
  return authors.length > 3 ? `${authors.slice(0, 3).join(", ")} et al.` : authors.join(", ");
}

/** Research: the closest arXiv papers, what each didn't do, and the gap the pick fills. */
export function PapersCard({ report, search }: { report?: PaperReport; search: SearchReport | null }) {
  const skipped = search?.skipped.find((s) => s.source === "arxiv");
  if (!report) {
    if (!skipped) return null;
    return (
      <Shell eyebrow="Papers that almost did this" title="Closest papers" footer="From the official arXiv API.">
        <p className="mt-3 text-sm text-slate-600">arXiv couldn&apos;t be searched this time ({skipped.reason}).</p>
      </Shell>
    );
  }

  return (
    <Shell
      eyebrow="Papers that almost did this"
      title="Closest papers"
      footer="From the official arXiv API. Only papers arXiv returned are cited; a keyword search can miss relevant work."
    >
      {report.papers.length === 0 ? (
        <p className="mt-3 text-slate-700">None of the papers arXiv returned were close to this idea.</p>
      ) : (
        <ol className="mt-5 space-y-3">
          {report.papers.map((p, i) => (
            <li key={p.url} className="rounded-2xl border border-line p-4">
              <RefNumber n={i + 1} />
              <ExternalTitle url={p.url}>{p.title}</ExternalTitle>
              <p className="mt-1 text-xs text-slate-500">
                {authorLine(p.authors)}
                {p.year && ` · ${p.year}`}
              </p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-slate-400">What they did</dt>
                  <dd className="mt-0.5 leading-relaxed text-slate-700">{p.did}</dd>
                </div>
                {p.missed && (
                  <div>
                    <dt className="text-xs font-medium text-slate-400">What they didn&apos;t do</dt>
                    <dd className="mt-0.5 leading-relaxed text-slate-700">{p.missed}</dd>
                  </div>
                )}
              </dl>
            </li>
          ))}
        </ol>
      )}
      {report.gap && (
        <Takeaway label="The gap">
          {!report.confident && (
            <span className="mb-2 inline-block rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-600/20">
              The judge isn&apos;t sure about this one
            </span>
          )}
          <p>{report.gap}</p>
        </Takeaway>
      )}
    </Shell>
  );
}
