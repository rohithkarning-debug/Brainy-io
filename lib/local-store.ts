// A tiny value kept in localStorage that React components can subscribe to
// with useSyncExternalStore. Browser-only: call get/set from event handlers,
// effects, or useSyncExternalStore's client snapshot, never during SSR.
//
// If localStorage is blocked or full (private mode, quota), the value still
// works for this tab; it just isn't remembered.

export function createLocalStore<T>(key: string, parse: (raw: unknown) => T) {
  let cache: T | undefined;
  const listeners = new Set<() => void>();

  function get(): T {
    if (cache === undefined) {
      let raw: unknown = null;
      try {
        const text = localStorage.getItem(key);
        raw = text ? JSON.parse(text) : null;
      } catch {
        // Blocked storage or bad JSON: start fresh.
      }
      cache = parse(raw);
    }
    return cache;
  }

  function set(value: T) {
    cache = value;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Full or blocked: keep the in-memory copy.
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    // Another tab changed the value: drop our copy so the next read reloads it.
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key) return;
      cache = undefined;
      listener();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  return { get, set, subscribe };
}
