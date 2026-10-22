"use client";

import { useEffect, useState } from "react";
import { PURPOSES, type Purpose } from "@/lib/purposes";

// Animated loading: a sweeping bar plus a message that changes every few seconds.
// The last message stays until results arrive.
export function LoadingState({ purpose }: { purpose: Purpose }) {
  const sources = PURPOSES[purpose].sources;
  const steps = [
    "Writing search queries…",
    "Searching the web…",
    ...(sources.includes("github") ? ["Searching GitHub…"] : []),
    ...(sources.includes("arxiv") ? ["Searching arXiv…"] : []),
    "Asking 3 models…",
    "Pushing your idea in 9 directions…",
    "Finding rare angles…",
    "Checking how crowded this space is…",
    "Judging…",
    "Brainy is picking a winner…",
  ];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 3000);
    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="mt-16 flex flex-col items-center gap-5 py-10 text-center" aria-live="polite">
      <div className="h-1 w-48 overflow-hidden rounded-full bg-slate-200">
        <div className="animate-sweep h-full w-1/3 rounded-full bg-gradient-to-r from-accent to-fuchsia-500" />
      </div>
      {/* key={step} remounts the text so the rise-in animation replays */}
      <p key={step} className="animate-rise-in text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
        {steps[step]}
      </p>
      <p className="text-sm text-slate-500">This usually takes 20–60 seconds.</p>
    </div>
  );
}
