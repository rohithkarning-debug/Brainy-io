import { useId } from "react";
import { LOGO_BODY, LOGO_COUNTER, LOGO_CREASE, LOGO_FLAP, LOGO_STOPS } from "@/lib/logo";

// The Brainy mark (see lib/logo.ts). Mono uses currentColor; `color` uses the
// reveal gradient. Both are always drawn and cross-fade, so switching is smooth.
export function LogoMark({ size = 32, color = false, className = "" }: { size?: number; color?: boolean; className?: string }) {
  // Unique per instance and safe inside url(#...).
  const id = "logo" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id={`${id}g`} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          {LOGO_STOPS.map(([offset, stop]) => (
            <stop key={offset} offset={offset} stopColor={stop} />
          ))}
        </linearGradient>
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <path fill="white" d={LOGO_BODY} />
          <rect {...LOGO_COUNTER} fill="black" />
          <path d={LOGO_CREASE} stroke="black" strokeWidth="1.8" />
        </mask>
      </defs>
      <g mask={`url(#${id}m)`}>
        <rect width="32" height="32" fill="currentColor" />
        <rect
          width="32"
          height="32"
          fill={`url(#${id}g)`}
          className="transition-opacity duration-1000"
          opacity={color ? 1 : 0}
        />
      </g>
      <path d={LOGO_FLAP} fill="white" className="transition-opacity duration-1000" opacity={color ? 0.35 : 0} />
    </svg>
  );
}

// Mark + "brainy" wordmark.
export function Logo({ size = 28, color = false }: { size?: number; color?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <LogoMark size={size} color={color} />
      <span className="text-lg font-semibold tracking-tight text-slate-950">brainy</span>
    </span>
  );
}
