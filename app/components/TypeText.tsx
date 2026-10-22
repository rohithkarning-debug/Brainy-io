"use client";

import { useEffect, useState } from "react";
import { useMotionAllowed } from "@/lib/settings";

// Texts that have already been typed out this session, so switching tabs
// or re-rendering a card doesn't replay the effect.
const typed = new Set<string>();

/**
 * Reveals `text` a few characters at a time, like a chat reply being typed.
 * Only when `animate` is set (fresh results) and motion is allowed; otherwise
 * the full text shows at once. Screen readers always get the full text.
 */
export function TypeText({ text, animate }: { text: string; animate: boolean }) {
  const motion = useMotionAllowed();
  const run = animate && motion && !typed.has(text);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!run) return;
    // Short texts type at a steady pace; long ones speed up to finish in ~1.5s.
    const perMs = Math.max(0.09, text.length / 1500);
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const n = Math.min(text.length, Math.ceil((now - start) * perMs));
      setCount(n);
      if (n < text.length) frame = requestAnimationFrame(tick);
      else typed.add(text);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, text]);

  if (!run) return <>{text}</>;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, count)}
        {count < text.length && <span className="typing-caret" />}
      </span>
    </>
  );
}
