"use client";

import { useEffect, useRef } from "react";
import { ResultView } from "@/app/components/ResultScreen";
import example from "@/lib/example-result.json";
import type { Result } from "@/lib/history";
import { setCooked } from "@/lib/reveal";

const EXAMPLE = example as Result;

// The pre-cooked sample on the home page. The page blooms into colour while it's
// on screen and fades back to black and white once it scrolls away.
export function ExampleResult() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Counts as on screen once it reaches the middle band of the viewport,
    // which works however tall the sample is on a phone.
    const observer = new IntersectionObserver(([entry]) => setCooked(entry.isIntersecting), {
      rootMargin: "-35% 0px -35% 0px",
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      setCooked(false, { animate: false });
    };
  }, []);

  return (
    <div ref={ref}>
      <ResultView result={EXAMPLE} example />
    </div>
  );
}
