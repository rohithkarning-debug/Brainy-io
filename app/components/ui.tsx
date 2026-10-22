// Small helpers to keep headings consistent.
export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6">
      <p className="text-sm font-semibold text-accent">{eyebrow}</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">{title}</h2>
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</p>;
}
