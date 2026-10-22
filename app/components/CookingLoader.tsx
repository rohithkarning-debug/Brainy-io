"use client";

import { useEffect, useState } from "react";
import { useMotionAllowed } from "@/lib/settings";

// Playful lines that rotate while Brainy works.
const LINES = [
  "Cooking",
  "Stirring the neurons",
  "Asking the big brain",
  "Preheating three models",
  "Seasoning with live search",
  "Pushing your idea in nine directions",
  "Hunting for rare angles",
  "Letting the judge taste-test",
  "Plating your answer",
];

/**
 * The "cooking" state: a sweeping bar, a playful line that changes every
 * 1.5s with a fade, and bouncing dots. `progress` is the honest status line
 * underneath (what has actually arrived), and it is what screen readers hear.
 */
export function CookingLoader({ progress }: { progress: string }) {
  const motion = useMotionAllowed();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!motion) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % LINES.length), 1500);
    return () => clearInterval(timer);
  }, [motion]);

  const line = motion ? LINES[index] : LINES[0];

  return (
    <div className="flex flex-col items-center gap-5 py-12 text-center">
      <div aria-hidden className="h-1 w-48 overflow-hidden rounded-full bg-slate-200">
        <div className="animate-sweep h-full w-1/3 rounded-full bg-slate-950" />
      </div>
      {/* key={index} remounts the line so the fade replays for each one */}
      <p
        key={index}
        aria-hidden
        className={`text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl ${motion ? "animate-fade-swap" : ""}`}
      >
        {line}
        <span className="ml-0.5 inline-flex gap-0.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="animate-dot inline-block" style={{ animationDelay: `${i * 0.15}s` }}>
              .
            </span>
          ))}
        </span>
      </p>
      <p role="status" aria-live="polite" className="text-sm text-slate-500">
        {progress}
      </p>
    </div>
  );
}

/** A placeholder card with shimmering bars, shown where a version will land. */
export function SkeletonCard({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex h-full flex-col gap-3 rounded-2xl border border-line bg-surface/70 p-6 shadow-card">
      <span className="w-fit rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-400">{label}</span>
      <div className="shimmer mt-1 h-5 w-3/4 rounded-md" />
      <div className="shimmer h-3.5 w-full rounded-md" />
      <div className="shimmer h-3.5 w-5/6 rounded-md" />
      <div className="mt-auto space-y-2.5 border-t border-line pt-4">
        <div className="shimmer h-3 w-1/3 rounded-md" />
        <div className="shimmer h-3.5 w-full rounded-md" />
        <div className="shimmer h-3 w-1/4 rounded-md" />
        <div className="shimmer h-3.5 w-11/12 rounded-md" />
      </div>
    </div>
  );
}
