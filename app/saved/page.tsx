import type { Metadata } from "next";
import { ResultList } from "@/app/components/ResultList";

export const metadata: Metadata = { title: "Saved" };

export default function SavedPage() {
  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">Saved</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950">Your favorites</h1>
      <p className="mt-3 max-w-xl text-slate-600">Results you&apos;ve saved. They stay even when you clear your history.</p>
      <ResultList mode="saved" />
    </div>
  );
}
