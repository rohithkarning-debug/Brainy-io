import type { ReactNode } from "react";

export const CONTACT_EMAIL = "rohithkarning@gmail.com";

// Shared layout for /privacy and /terms: a title, then headed sections of plain prose.
export function LegalPage({
  eyebrow,
  title,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  sections: { heading: string; body: ReactNode }[];
}) {
  return (
    <div className="max-w-3xl pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950">{title}</h1>
      <p className="mt-3 text-sm text-slate-500">Last updated {updated}</p>

      <div className="mt-10 space-y-10">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-slate-950">{s.heading}</h2>
            <div className="mt-3 space-y-3 leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-slate-950 [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

export function ContactLink() {
  return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>;
}
