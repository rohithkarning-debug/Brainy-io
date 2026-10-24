"use client";

import { useState } from "react";
import { useToast } from "@/app/components/Toast";
import { Switch } from "@/app/components/ui";
import { deleteMyData, disableSync, enableSync, useSync } from "@/lib/sync";

/** Settings → "Sync history across devices". Off by default. */
export function SyncSettings() {
  const sync = useSync();
  const toast = useToast();
  const [asking, setAsking] = useState(false); // "Keep or delete your cloud copy?"

  async function turnOn() {
    try {
      await enableSync();
      toast("Sync is on");
    } catch {
      // The error is shown under the switch.
    }
  }

  async function turnOff(keep: boolean) {
    setAsking(false);
    try {
      await disableSync(keep);
      toast(keep ? "Sync is off. Your cloud copy is kept." : "Sync is off. Your cloud copy is deleted.");
    } catch {
      // Shown below.
    }
  }

  return (
    <section
      id="sync"
      aria-labelledby="sync-title"
      className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 id="sync-title" className="font-semibold tracking-tight text-slate-950">
            Sync history across devices
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Off by default: your history stays in this browser. Turn it on to keep a copy in Brainy&apos;s database,
            tied to your account, so it shows up wherever you sign in. Stored: your results (ideas, directions,
            verdicts, kept search results, bred ideas), what you&apos;ve saved, and your settings.{" "}
            <strong className="font-medium text-slate-700">Your API keys never leave this browser.</strong>
          </p>
        </div>
        <Switch
          label="Sync history across devices"
          checked={sync.enabled}
          onChange={(on) => (on ? void turnOn() : setAsking(true))}
        />
      </div>

      {asking && (
        <div role="alertdialog" aria-label="Keep or delete your cloud copy?" className="mt-4 rounded-xl border border-line bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-950">Keep or delete your cloud copy?</p>
          <p className="mt-1 text-sm text-slate-500">
            This browser keeps its history either way. Keeping the cloud copy lets you turn sync back on later;
            public links stop working if you delete it.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void turnOff(true)}
              className="rounded-full border border-slate-950 bg-surface px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-slate-50"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={() => void turnOff(false)}
              className="rounded-full bg-rose-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-rose-700"
            >
              Delete it
            </button>
            <button type="button" onClick={() => setAsking(false)} className="px-2 text-sm font-medium text-slate-500 hover:text-slate-900">
              Cancel
            </button>
          </div>
        </div>
      )}

      <p role="status" className="mt-3 text-xs text-slate-500">
        {sync.busy ??
          (sync.enabled
            ? sync.lastSyncedAt
              ? `On · last synced ${new Date(sync.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : "On"
            : "Off")}
      </p>
      {sync.error && <p className="mt-1 text-xs text-rose-700">{sync.error}</p>}
    </section>
  );
}

/** Settings → "Delete my data". Asks once more first. */
export function DeleteMyData() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteMyData();
      setConfirming(false);
      toast("Your data is deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete your data");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="delete-title" className="rounded-2xl border border-rose-200 bg-surface p-5 shadow-card sm:p-6">
      <h2 id="delete-title" className="font-semibold tracking-tight text-slate-950">
        Delete my data
      </h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
        Deletes your cloud copy (results, public links and settings) from Brainy&apos;s database, plus this
        browser&apos;s history, saved results, settings and API keys. Other browsers keep their own local history
        until you clear it there. Daily usage counts hold nothing else and reset on their own.
      </p>
      {confirming ? (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-600">Delete everything? This can&apos;t be undone.</span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void remove()}
            className="rounded-full bg-rose-600 px-4 py-1.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {busy ? "Deleting…" : "Yes, delete it all"}
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="font-medium text-slate-500 hover:text-slate-900">
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="mt-4 rounded-full border border-rose-300 px-4 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
        >
          Delete my data
        </button>
      )}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
