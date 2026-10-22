// Temporary page for choosing the new logo. Delete this folder once one is picked.

import type { Metadata } from "next";
import { AppIcon, CONCEPTS, FaviconTab, Lockup, Mark, OgCard, type Concept } from "./concepts";

export const metadata: Metadata = { title: "Logo lab", robots: { index: false } };

const SIZES = [16, 24, 32, 48, 96];

export default function LogoLabPage() {
  return (
    <div className="space-y-16 py-10">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">Logo lab</h1>
        <p className="mt-2 text-slate-600">Three concepts, mono and colour, light and dark. Pick one.</p>
      </header>

      {CONCEPTS.map((c) => (
        <section key={c.id} className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">{c.name}</h2>
            <p className="text-sm text-slate-600">{c.idea}</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel concept={c.id} dark={false} />
            <Panel concept={c.id} dark />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <OgCard concept={c.id} variant="mono" />
            <OgCard concept={c.id} variant="color" />
          </div>
        </section>
      ))}
    </div>
  );
}

// Everything for one concept on one background. Colours are fixed here so
// the panels look the same whatever theme the site is in.
function Panel({ concept, dark }: { concept: Concept; dark: boolean }) {
  return (
    <div
      className={`space-y-6 rounded-2xl border p-6 ${
        dark ? "border-neutral-800 bg-[#0a0a0a] text-white" : "border-neutral-200 bg-white text-[#0a0a0a]"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">{dark ? "Dark" : "Light"}</p>
      {(["mono", "color"] as const).map((variant) => (
        <div key={variant} className="space-y-4">
          <p className="text-xs opacity-60">{variant === "mono" ? "Mono" : "Colour"}</p>
          <div className="flex flex-wrap items-end gap-5">
            {SIZES.map((size) => (
              <div key={size} className="flex flex-col items-center gap-1">
                <Mark concept={concept} variant={variant} size={size} />
                <span className="text-[10px] opacity-50">{size}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <Lockup concept={concept} variant={variant} size={24} />
            <Lockup concept={concept} variant={variant} size={40} />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-end gap-4">
        <FaviconTab concept={concept} dark={dark} />
        <AppIcon concept={concept} size={64} />
        <AppIcon concept={concept} variant="color" size={64} />
        <AppIcon concept={concept} variant="color" size={40} />
      </div>
    </div>
  );
}
