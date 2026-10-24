// Opt-in cloud sync, the browser side. Off by default: until a user turns on
// "Sync history across devices", nothing here talks to the server except one
// small "is sync on for this account?" check.
//
// When it's on, this browser stays the working copy (everything still works
// offline) and the cloud copy follows it:
//   - every change in lib/history.ts and lib/settings.ts is queued and sent
//     shortly after (new runs, crosses, re-judges, save/unsave, deletes);
//   - on load and whenever the tab comes back, it pulls what other devices
//     changed. The newer copy of each result wins. A result this browser
//     synced before that has vanished from the cloud was deleted elsewhere,
//     so it goes here too; one it never synced is new and gets uploaded.
// The queue is kept in localStorage, so closing the tab mid-way loses nothing.
// API keys are never part of any of this. Browser-only.

import { useSyncExternalStore } from "react";
import {
  getHistory,
  getResult,
  mergeRemote,
  onHistoryChange,
  updateResult,
  wipeHistory,
  type Result,
} from "@/lib/history";
import { removeKey } from "@/lib/keys";
import { createLocalStore } from "@/lib/local-store";
import { applyRemoteSettings, getSettings, onSettingsChange, DEFAULT_SETTINGS } from "@/lib/settings";

type State = {
  userId: string | null; // the account this state belongs to
  enabled: boolean;
  synced: string[]; // result ids this browser knows are in the cloud copy
  dirty: string[]; // changed here, not uploaded yet
  removed: string[]; // deleted here, not deleted in the cloud yet
  pulledAt: number; // server time of the last pull
  settingsAt: number; // server time of the settings we last applied or sent
  settingsDirty: boolean;
};

const EMPTY: State = {
  userId: null,
  enabled: false,
  synced: [],
  dirty: [],
  removed: [],
  pulledAt: 0,
  settingsAt: 0,
  settingsDirty: false,
};

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const store = createLocalStore<State>("brainy:sync", (raw) => {
  const r = (raw ?? {}) as Partial<Record<keyof State, unknown>>;
  return {
    userId: typeof r.userId === "string" ? r.userId : null,
    enabled: r.enabled === true,
    synced: strings(r.synced),
    dirty: strings(r.dirty),
    removed: strings(r.removed),
    pulledAt: typeof r.pulledAt === "number" ? r.pulledAt : 0,
    settingsAt: typeof r.settingsAt === "number" ? r.settingsAt : 0,
    settingsDirty: r.settingsDirty === true,
  };
});

const patch = (change: Partial<State>) => store.set({ ...store.get(), ...change });
const add = (list: string[], ids: string[]) => [...new Set([...list, ...ids])];
const drop = (list: string[], ids: string[]) => list.filter((id) => !ids.includes(id));

// ---------- What the page shows ----------

export type SyncStatus = {
  enabled: boolean;
  busy: string | null; // e.g. "Uploading 12 results…"
  error: string | null;
  lastSyncedAt: number | null; // ms, local clock
};

let status: SyncStatus = { enabled: false, busy: null, error: null, lastSyncedAt: null };
const listeners = new Set<() => void>();
function setStatus(change: Partial<SyncStatus>) {
  status = { ...status, ...change };
  listeners.forEach((l) => l());
}

const OFF: SyncStatus = { enabled: false, busy: null, error: null, lastSyncedAt: null };

export function useSync(): SyncStatus {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => status,
    () => OFF
  );
}

// ---------- Talking to the server ----------

async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    cache: "no-store",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && data.syncOff) {
    // Turned off on another device: stop here too, keeping the local copy.
    turnedOffElsewhere();
    throw new Error("Sync is off for this account.");
  }
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

function turnedOffElsewhere() {
  patch({ enabled: false, synced: [], dirty: [], removed: [], pulledAt: 0, settingsDirty: false });
  setStatus({ enabled: false, busy: null });
}

const BATCH = 10;
// Flushes run one after another: each waits for the one before it.
let flushing: Promise<void> = Promise.resolve();
let timer: ReturnType<typeof setTimeout> | undefined;

function schedule(ms = 800) {
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
}

/** Send everything queued. Safe to call any time; failures stay queued for next time. */
export function flush(): Promise<void> {
  flushing = flushing.then(sendQueued);
  return flushing;
}

async function sendQueued() {
    try {
      let s = store.get();
      if (!s.enabled) return;
      for (const id of s.removed) {
        await api("DELETE", `/api/sync/results?id=${encodeURIComponent(id)}`);
        s = store.get();
        patch({ removed: drop(s.removed, [id]), synced: drop(s.synced, [id]) });
      }
      s = store.get();
      const waiting = s.dirty.map((id) => getResult(id)).filter((r): r is Result => Boolean(r));
      // Ids that are dirty but no longer here (e.g. trimmed) have nothing to send.
      patch({ dirty: drop(s.dirty, s.dirty.filter((id) => !getResult(id))) });
      for (let i = 0; i < waiting.length; i += BATCH) {
        const batch = waiting.slice(i, i + BATCH);
        if (waiting.length > BATCH) setStatus({ busy: `Uploading ${Math.min(i + BATCH, waiting.length)} of ${waiting.length} results…` });
        await api("POST", "/api/sync/results", { results: batch });
        const ids = batch.map((r) => r.id);
        s = store.get();
        patch({ dirty: drop(s.dirty, ids), synced: add(s.synced, ids) });
      }
      if (store.get().settingsDirty) {
        await api("PUT", "/api/sync/settings", { settings: getSettings() });
        patch({ settingsDirty: false });
      }
      setStatus({ busy: null, error: null, lastSyncedAt: Date.now() });
    } catch (err) {
      setStatus({ busy: null, error: err instanceof Error ? err.message : "Sync failed" });
    }
}

/** Bring in what other devices changed, then send what's queued here. */
export async function pull() {
  const s = store.get();
  if (!s.userId) return;
  try {
    const data = await api("GET", `/api/sync?since=${s.enabled ? s.pulledAt : 0}`);
    if (!data.enabled) {
      if (store.get().enabled) turnedOffElsewhere();
      return;
    }
    const now = store.get();
    const cloud = new Set<string>(strings(data.ids));
    // Synced before, gone now, not changed here since: deleted on another device.
    const goneElsewhere = now.synced.filter((id) => !cloud.has(id) && !now.dirty.includes(id));
    const incoming = (Array.isArray(data.results) ? data.results : []).filter(
      (r: Result) => typeof r?.id === "string" && typeof r?.idea === "string" && !now.removed.includes(r.id)
    );
    mergeRemote(incoming, goneElsewhere);

    // Anything here the cloud has never had is new: queue it.
    const fresh = getHistory()
      .filter((r) => !cloud.has(r.id) && !now.synced.includes(r.id))
      .map((r) => r.id);

    let { settingsAt, settingsDirty } = now;
    if (data.settings && data.settings.updatedAt > settingsAt && !settingsDirty) {
      applyRemoteSettings(data.settings.data);
      settingsAt = data.settings.updatedAt;
    } else if (!data.settings) {
      settingsDirty = true; // the cloud has none yet: send ours
    }

    patch({
      enabled: true,
      synced: [...cloud].filter((id) => !now.removed.includes(id)),
      dirty: add(now.dirty, fresh),
      pulledAt: typeof data.now === "number" ? data.now : now.pulledAt,
      settingsAt,
      settingsDirty,
    });
    setStatus({ enabled: true, error: null, lastSyncedAt: Date.now() });
    await flush();
  } catch (err) {
    setStatus({ error: err instanceof Error ? err.message : "Sync failed" });
  }
}

// ---------- Following local changes ----------

onHistoryChange(({ upserted, removed }) => {
  const s = store.get();
  if (!s.enabled) return;
  const up = upserted.map((r) => r.id);
  patch({ dirty: drop(add(s.dirty, up), removed), removed: add(drop(s.removed, up), removed) });
  schedule();
});

onSettingsChange(() => {
  if (!store.get().enabled) return;
  patch({ settingsDirty: true });
  schedule(1500);
});

/**
 * Called whenever the signed-in account changes (null = signed out). A
 * different account starts from a clean slate: one account's queue is never
 * sent to another.
 */
export function startSync(userId: string | null) {
  const s = store.get();
  if (s.userId !== userId) store.set({ ...EMPTY, userId });
  setStatus({ enabled: store.get().enabled, error: null });
  if (userId) void pull();
}

// ---------- Settings → "Sync history across devices" ----------

/** Turn sync on: upload this browser's results and settings, then pull the rest. */
export async function enableSync() {
  setStatus({ busy: "Turning on sync…", error: null });
  try {
    await api("POST", "/api/sync", { action: "enable", settings: getSettings() });
    patch({ enabled: true, dirty: getHistory().map((r) => r.id), removed: [], synced: [], pulledAt: 0, settingsDirty: false });
    setStatus({ enabled: true });
    await flush();
    await pull();
    setStatus({ busy: null });
  } catch (err) {
    setStatus({ busy: null, error: err instanceof Error ? err.message : "Couldn't turn on sync" });
    throw err;
  }
}

/** Turn sync off; `keep: false` also deletes the cloud copy. This browser keeps its history either way. */
export async function disableSync(keep: boolean) {
  setStatus({ busy: keep ? "Turning off sync…" : "Deleting your cloud copy…", error: null });
  try {
    await api("POST", "/api/sync", { action: "disable", keep });
    turnedOffElsewhere();
  } catch (err) {
    setStatus({ busy: null, error: err instanceof Error ? err.message : "Couldn't turn off sync" });
    throw err;
  }
}

/** "Delete my data": the cloud copy (if any), then this browser's history, settings and keys. */
export async function deleteMyData() {
  setStatus({ busy: "Deleting your data…", error: null });
  try {
    await api("DELETE", "/api/me");
    const userId = store.get().userId;
    store.set({ ...EMPTY, userId });
    wipeHistory();
    applyRemoteSettings(DEFAULT_SETTINGS);
    removeKey("openrouter");
    removeKey("tavily");
    setStatus({ ...OFF });
  } catch (err) {
    setStatus({ busy: null, error: err instanceof Error ? err.message : "Couldn't delete your data" });
    throw err;
  }
}

/** Make a synced result public (returns its /r/ slug) or private (returns null). */
export async function setPublic(id: string, isPublic: boolean): Promise<string | null> {
  await flush(); // it must be in the cloud copy first
  const { slug } = await api("POST", "/api/sync/share", { id, public: isPublic });
  updateResult(id, () => ({ shareSlug: slug ?? undefined }), { silent: true });
  return slug ?? null;
}
