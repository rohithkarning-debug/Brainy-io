import { Label } from "@/app/components/ui";
import { hostname, sourceList } from "@/lib/format";
import type { BrainyTake, SimilarThing } from "@/lib/openrouter";
import { SOURCE_LABELS } from "@/lib/purposes";
import type { SearchReport } from "@/lib/search";

// Colors for the saturation badge.
export const SATURATION_STYLES: Record<BrainyTake["saturation"], string> = {
  Fresh: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  Crowded: "bg-amber-50 text-amber-700 ring-amber-600/20",
  "Very saturated": "bg-rose-50 text-rose-700 ring-rose-600/20",
};

// The big highlighted verdict card at the top of the results.
export function BrainyTakeCard({ take, search }: { take: BrainyTake; search: SearchReport }) {
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
export function SimilarItem({ thing }: { thing: SimilarThing }) {
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
export function SearchNote({ search }: { search: SearchReport }) {
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
