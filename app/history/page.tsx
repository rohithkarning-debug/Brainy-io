import type { Metadata } from "next";
import { ResultList } from "@/app/components/ResultList";
import { StorageNote } from "@/app/components/StorageNote";

export const metadata: Metadata = { title: "History" };

export default function HistoryPage() {
  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">History</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950">Everything you&apos;ve cooked</h1>
      <StorageNote />
      <ResultList mode="history" />
    </div>
  );
}
