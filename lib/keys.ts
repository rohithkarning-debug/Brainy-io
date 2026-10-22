// The visitor's own API keys ("bring your own key"), kept ONLY in this
// browser's localStorage. They are sent per request in headers and never
// stored or logged by the server. Browser-only.

import { useSyncExternalStore } from "react";
import { KEY_HEADERS, isValidKey, type KeyProvider } from "@/lib/key-format";
import { createLocalStore } from "@/lib/local-store";

export type UserKeys = Partial<Record<KeyProvider, string>>;

const EMPTY: UserKeys = {};

// Drop anything that isn't a well-formed key, so a hand-edited entry can't break requests.
const store = createLocalStore<UserKeys>("brainy:keys", (raw) => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const keys: UserKeys = {};
  for (const p of Object.keys(KEY_HEADERS) as KeyProvider[]) {
    const v = r[p];
    if (typeof v === "string" && isValidKey(p, v)) keys[p] = v;
  }
  return keys;
});

export function useKeys(): UserKeys {
  return useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
}

export function setKey(provider: KeyProvider, key: string) {
  store.set({ ...store.get(), [provider]: key });
}

export function removeKey(provider: KeyProvider) {
  const next = { ...store.get() };
  delete next[provider];
  store.set(next);
}

/** Headers carrying the stored keys, for calls to Brainy's own API. */
export function keyHeaders(): Record<string, string> {
  const keys = store.get();
  const headers: Record<string, string> = {};
  for (const [p, key] of Object.entries(keys) as [KeyProvider, string][]) headers[KEY_HEADERS[p]] = key;
  return headers;
}
