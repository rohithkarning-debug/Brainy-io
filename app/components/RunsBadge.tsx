"use client";

import Link from "next/link";
import { useKeys } from "@/lib/keys";
import { useFuelOut, useRemaining } from "@/lib/run";

/**
 * "3 free runs left today", "Using your key" or "Free fuel is out".
 * Shows nothing until the count is known, or when limits are off.
 * Whoever renders it calls refreshRemaining() to load the count.
 * `className` sets the display (default inline-flex), e.g. "hidden lg:inline-flex".
 */
export function RunsBadge({ className = "inline-flex" }: { className?: string }) {
  const remaining = useRemaining();
  const fuelOut = useFuelOut();
  const ownKey = Boolean(useKeys().openrouter);

  const base = `items-center gap-1.5 whitespace-nowrap rounded-full text-xs tabular-nums ${className}`;

  if (ownKey) {
    return (
      <Link href="/settings#api-keys" className={`${base} text-slate-500 hover:text-slate-900`}>
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Using your key
      </Link>
    );
  }
  if (fuelOut) {
    return (
      <Link href="/settings#api-keys" className={`${base} text-amber-700 hover:underline`}>
        Free fuel is out · add a key
      </Link>
    );
  }
  if (typeof remaining !== "number") return null;
  return (
    <span className={`${base} text-slate-500`}>
      {remaining} free run{remaining === 1 ? "" : "s"} left today
    </span>
  );
}
