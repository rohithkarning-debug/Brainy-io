"use client";

import { CopyShareButtons } from "@/app/components/CopyShare";
import { TypeText } from "@/app/components/TypeText";
import { Disclosure } from "@/app/components/ui";
import { versionToText } from "@/lib/format";
import type { Version } from "@/lib/openrouter";
import { PURPOSES, type Purpose } from "@/lib/purposes";

// Top-border colours that appear on the reveal, one per card in turn.
const REVEAL_COLORS = ["violet", "pink", "orange", "cyan"];

// One card showing a single version of the idea, with fields for its purpose.
// `live` = it just arrived from a run, so the pitch types itself out.
// `picked` = the judge built its pick on this direction; highlighted once cooked.
export function VersionCard({
  version,
  purpose,
  muted = false,
  live = false,
  detailsOpen = true,
  colorIndex = 0,
  picked = false,
}: {
  version: Version;
  purpose: Purpose;
  muted?: boolean;
  live?: boolean;
  detailsOpen?: boolean;
  colorIndex?: number;
  picked?: boolean;
}) {
  return (
    <article
      className={`animate-rise-in relative flex h-full flex-col gap-3 rounded-2xl border p-6 transition duration-200 ${
        muted
          ? "border-dashed border-slate-300 bg-slate-50/60"
          : "border-line bg-surface shadow-card hover:-translate-y-1 hover:shadow-lift"
      } ${picked ? "cooked:ring-2 cooked:ring-accent" : ""}`}
    >
      {!muted && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-1 rounded-t-2xl opacity-0 transition-opacity duration-1000 cooked:opacity-100"
          style={{ background: `var(--color-reveal-${REVEAL_COLORS[colorIndex % REVEAL_COLORS.length]})` }}
        />
      )}
      {/* Direction label + model name, actions on the right */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={`rounded-full px-2.5 py-1 font-semibold ${
              muted ? "bg-slate-200/70 text-slate-600" : "bg-accent/10 text-accent"
            }`}
          >
            {version.direction}
          </span>
          {picked && (
            <span className="hidden rounded-full bg-accent px-2.5 py-1 font-semibold text-on-accent cooked:inline-block">
              Brainy&apos;s pick
            </span>
          )}
          <span className="break-all font-mono text-slate-400">{version.model}</span>
        </div>
        <div className="-mr-2 -mt-1 shrink-0">
          <CopyShareButtons title={version.title} text={versionToText(version, purpose)} />
        </div>
      </div>

      <h3 className="text-xl font-semibold leading-snug tracking-[-0.02em] text-slate-950">{version.title}</h3>
      <p className="leading-relaxed text-slate-600">
        <TypeText text={version.pitch} animate={live} />
      </p>

      <div className="mt-auto border-t border-line pt-3">
        <Disclosure defaultOpen={detailsOpen} summary={<span className="text-xs font-medium text-slate-500">Details</span>}>
          <dl className="space-y-3 pt-3 text-sm">
            {PURPOSES[purpose].fields.map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-medium text-slate-400">{f.label}</dt>
                <dd className="mt-0.5 leading-relaxed text-slate-700">{version.details[f.key]}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </div>
    </article>
  );
}
