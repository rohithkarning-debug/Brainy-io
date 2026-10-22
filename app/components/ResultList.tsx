"use client";

import Link from "next/link";
import { useState } from "react";
import { SATURATION_STYLES } from "@/app/components/BrainyTakeCard";
import { useToast } from "@/app/components/Toast";
import { Icon, IconButton } from "@/app/components/ui";
import { formatDate } from "@/lib/format";
import { clearHistory, removeResult, togglePin, useHistory, type Result } from "@/lib/history";
import { PURPOSES, PURPOSE_KEYS, type Purpose } from "@/lib/purposes";

// Everything a search can match: the idea and every title in the result.
function searchText(r: Result) {
  return [r.idea, r.take?.pick.title, ...r.versions.map((v) => v.title)].join(" ").toLowerCase();
}

/** The History page (every result) or the Saved page (pinned only). */
export function ResultList({ mode }: { mode: "history" | "saved" }) {
  const all = useHistory();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [purpose, setPurpose] = useState<Purpose | "all">("all");
  const [confirmClear, setConfirmClear] = useState(false);

  if (all === null) {
    return (
      <ul aria-hidden className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <li key={i} className="shimmer h-20 rounded-2xl" />
        ))}
      </ul>
    );
  }

  const base = mode === "saved" ? all.filter((r) => r.pinned) : all;
  const q = query.trim().toLowerCase();
  const items = base.filter((r) => (purpose === "all" || r.purpose === purpose) && (!q || searchText(r).includes(q)));

  if (base.length === 0) {
    return (
      <div className="mt-10 max-w-xl rounded-2xl border border-dashed border-slate-300 bg-surface/60 p-8 text-center">
        <p className="font-medium text-slate-800">
          {mode === "saved" ? "Nothing saved yet." : "No ideas cooked yet."}
        </p>
        <p className="mt-1 text-sm text-slate-500">
          {mode === "saved"
            ? "Press Save on any result to keep it here. Saved results survive clearing your history."
            : "Every result you get is kept here, in this browser."}
        </p>
        <Link href="/ask" className="mt-5 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent-dark">
          Cook something
        </Link>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {/* ---------- Search + filters ---------- */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-sm">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ideas and titles"
            aria-label="Search results"
            className="w-full rounded-full border border-line bg-surface py-2.5 pl-10 pr-4 text-sm text-slate-900 shadow-card outline-none placeholder:text-slate-400 focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          />
        </div>
        <div role="group" aria-label="Filter by purpose" className="flex flex-wrap gap-1.5">
          {(["all", ...PURPOSE_KEYS] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={purpose === p}
              onClick={() => setPurpose(p)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                purpose === p ? "bg-slate-900 text-slate-50" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              }`}
            >
              {p === "all" ? "All" : PURPOSES[p].label}
            </button>
          ))}
        </div>
      </div>

      {/* ---------- The list ---------- */}
      {items.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">Nothing matches that search.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((r) => (
            <li
              key={r.id}
              className="animate-rise-in flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card transition hover:border-accent/30 hover:shadow-lift sm:p-5"
            >
              <Link href={`/result/${r.id}`} className="min-w-0 flex-1 rounded-lg">
                <p className="line-clamp-2 font-medium text-slate-900">{r.idea}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="rounded-full bg-accent/10 px-2 py-0.5 font-semibold text-accent">{PURPOSES[r.purpose].label}</span>
                  {r.take && (
                    <span className={`rounded-full px-2 py-0.5 font-semibold ring-1 ring-inset ${SATURATION_STYLES[r.take.saturation]}`}>
                      {r.take.saturation}
                    </span>
                  )}
                  {r.status !== "done" && <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium">Partial</span>}
                  <span>{formatDate(r.createdAt)}</span>
                  {r.take && <span className="truncate">· Pick: {r.take.pick.title}</span>}
                </div>
              </Link>
              <div className="flex shrink-0 items-center">
                <IconButton
                  icon="bookmark"
                  label={r.pinned ? "Unsave" : "Save"}
                  active={r.pinned}
                  onClick={() => toast(togglePin(r.id) ? "Saved to favorites" : "Removed from saved")}
                />
                <IconButton
                  icon="trash"
                  label="Delete"
                  onClick={() => {
                    removeResult(r.id);
                    toast("Deleted");
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ---------- Clear all (history only, asks once more first) ---------- */}
      {mode === "history" && (
        <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
          {confirmClear ? (
            <>
              <span className="text-slate-600">Clear all history? Saved results are kept.</span>
              <button
                type="button"
                onClick={() => {
                  clearHistory();
                  setConfirmClear(false);
                  toast("History cleared");
                }}
                className="rounded-full bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700"
              >
                Yes, clear it
              </button>
              <button type="button" onClick={() => setConfirmClear(false)} className="font-medium text-slate-500 hover:text-slate-900">
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="inline-flex items-center gap-1.5 font-medium text-slate-500 hover:text-rose-600"
            >
              <Icon name="trash" /> Clear all history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
