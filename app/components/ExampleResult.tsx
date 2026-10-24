"use client";

import { ResultView } from "@/app/components/ResultScreen";
import example from "@/lib/example-result.json";
import type { Result } from "@/lib/history";

const EXAMPLE = example as Result;

// The pre-cooked sample on the home page. Colour is only for real cooked
// results, so the sample never triggers the reveal (ResultView skips it for
// `example`), and `grayscale` keeps fixed accents like the saturation badge
// monochrome too.
export function ExampleResult() {
  return (
    <div>
      <div className="grayscale">
        <ResultView result={EXAMPLE} example />
      </div>
      <p className="mt-4 text-center text-sm text-slate-500">Cook your own to see it in colour.</p>
    </div>
  );
}
