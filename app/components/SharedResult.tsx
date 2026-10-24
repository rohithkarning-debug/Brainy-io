"use client";

import { useSyncExternalStore } from "react";
import { ResultView } from "@/app/components/ResultScreen";
import type { Result } from "@/lib/history";

const noop = () => () => {};

// A public result at /r/[slug]: read-only, in colour. Drawn in the browser
// only, so dates show in the viewer's own timezone without a hydration mismatch.
export function SharedResult({ result }: { result: Result }) {
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted) return <div aria-hidden className="shimmer mt-14 h-64 w-full rounded-3xl" />;
  return <ResultView result={result} shared />;
}
