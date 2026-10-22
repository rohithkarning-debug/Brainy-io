import type { Version } from "@/lib/openrouter";
import { PURPOSES, type Purpose } from "@/lib/purposes";

// One card showing a single version of the idea, with fields for its purpose.
export function VersionCard({
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
