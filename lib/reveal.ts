// "Monochrome until it's cooked": whether the page is in colour right now.
// The result screen turns it on once a result is finished; the nav logo and
// the background mesh follow it. It is mirrored to <html data-cooked="on">,
// which switches the CSS colour tokens (app/globals.css). Browser-only.

import { useSyncExternalStore } from "react";

let cooked = false;
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useCooked(): boolean {
  return useSyncExternalStore(subscribe, () => cooked, () => false);
}

/**
 * Turn colour on or off. `animate: false` switches instantly, for opening a
 * result that's already finished or for leaving one.
 */
export function setCooked(value: boolean, { animate = true }: { animate?: boolean } = {}) {
  const root = document.documentElement;
  if (!animate) {
    root.dataset.reveal = "instant";
    // Let the instant switch paint, then bring transitions back.
    requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.reveal));
  }
  if (value) root.dataset.cooked = "on";
  else delete root.dataset.cooked;

  if (cooked === value) return;
  cooked = value;
  listeners.forEach((l) => l());
}
