
// Three candidate Brainy logos, drawn on a 32×32 grid so they stay crisp as a 16px favicon.
// Mono marks use currentColor; colour marks use the post-reveal palette.
// Temporary: the winner moves to app/components/Logo.tsx and this folder is deleted.

import { useId } from "react";

export type Concept = "note" | "huddle" | "spark";
export type Variant = "mono" | "color";

// The post-reveal palette.
export const PALETTE = { violet: "#7c3aed", pink: "#ec4899", orange: "#fb923c", cyan: "#06b6d4" };

export const CONCEPTS: { id: Concept; name: string; idea: string }[] = [
  {
    id: "note",
    name: "A · Sticky b",
    idea: "One sticky note whose outline is a lowercase b, with a folded corner. The rough idea, written down.",
  },
  {
    id: "huddle",
    name: "B · Huddle",
    idea: "Three small notes with scribbled lines converging into one bigger note: idea → many versions → verdict.",
  },
  {
    id: "spark",
    name: "C · Spark b",
    idea: "A b traced through connected dots, like a mind-map, with a spark on top. Connections becoming one idea.",
  },
];

// SVG ids must be unique per instance and safe inside url(#...).
function useSvgId() {
  return "l" + useId().replace(/[^a-zA-Z0-9]/g, "");
}

export function Mark({
  concept,
  variant = "mono",
  size = 32,
  className,
}: {
  concept: Concept;
  variant?: Variant;
  size?: number;
  className?: string;
}) {
  const Shape = { note: NoteMark, huddle: HuddleMark, spark: SparkMark }[concept];
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" role="img" aria-label="Brainy" className={className}>
      <Shape color={variant === "color"} />
    </svg>
  );
}

// Diagonal violet → pink → orange, shared by the colour marks.
function Gradient({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">
      <stop offset="0" stopColor={PALETTE.violet} />
      <stop offset="0.55" stopColor={PALETTE.pink} />
      <stop offset="1" stopColor={PALETTE.orange} />
    </linearGradient>
  );
}

// A: stem + square bowl = "b". The bottom-right corner is cut and folded over.
function NoteMark({ color }: { color: boolean }) {
  const id = useSvgId();
  return (
    <>
      <defs>
        <Gradient id={`${id}g`} />
        <mask id={`${id}m`} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
          <path
            fill="white"
            d="M5 2h3a2 2 0 0 1 2 2v7h15a3 3 0 0 1 3 3v8l-8 8H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
          />
          {/* the counter of the b */}
          <rect x="10" y="15.5" width="8" height="8.5" rx="2" fill="black" />
          {/* crease around the folded flap */}
          <path d="M28 22h-8v8" stroke="black" strokeWidth="1.8" />
        </mask>
      </defs>
      <rect width="32" height="32" mask={`url(#${id}m)`} fill={color ? `url(#${id}g)` : "currentColor"} />
      {/* the flap is a shade lighter in colour */}
      {color && <path d="M20.9 22.9h6.1l-6.1 6.1z" fill="white" fillOpacity="0.35" />}
    </>
  );
}

// B: three small notes, scribbled lines converging into one bigger note.
function HuddleMark({ color }: { color: boolean }) {
  const id = useSvgId();
  const fill = (c: string) => (color ? c : "currentColor");
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="17" y1="8" x2="30" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor={PALETTE.pink} />
          <stop offset="1" stopColor={PALETTE.orange} />
        </linearGradient>
      </defs>
      <g stroke={color ? "#a3a3a3" : "currentColor"} strokeWidth="1.8" strokeLinecap="round" fill="none">
        <path d="M9 5.5c4 0 4 10 8 10.5" />
        <path d="M9 16h8" />
        <path d="M9 26.5c4 0 4-10 8-10.5" />
      </g>
      <rect x="2" y="2" width="7" height="7" rx="1.6" fill={fill(PALETTE.violet)} />
      <rect x="2" y="12.5" width="7" height="7" rx="1.6" fill={fill(PALETTE.cyan)} />
      <rect x="2" y="23" width="7" height="7" rx="1.6" fill={fill(PALETTE.pink)} />
      {/* the verdict: bigger, with a folded corner */}
      <path d="M20 8h10v11l-5 5h-5a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" fill={color ? `url(#${id}g)` : "currentColor"} />
    </>
  );
}

// C: a b traced through connected dots, with a four-point spark on top.
function SparkMark({ color }: { color: boolean }) {
  const id = useSvgId();
  const paint = color ? `url(#${id}g)` : "currentColor";
  const dots: [number, number][] = [
    [8, 17],
    [8, 28],
    [19, 14],
    [26, 21],
    [19, 28],
  ];
  return (
    <>
      <defs>
        <Gradient id={`${id}g`} />
      </defs>
      <path
        d="M8 9.5V28M8 17l11-3 7 7-7 7H8"
        stroke={paint}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {dots.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.9" fill={paint} />
      ))}
      <path
        d="M8 .5Q8.7 4.3 12.5 5 8.7 5.7 8 9.5 7.3 5.7 3.5 5 7.3 4.3 8 .5z"
        fill={color ? PALETTE.orange : "currentColor"}
      />
    </>
  );
}

// Mark + "brainy" wordmark.
export function Lockup({ concept, variant = "mono", size = 32 }: { concept: Concept; variant?: Variant; size?: number }) {
  return (
    <span className="inline-flex items-center" style={{ gap: size * 0.3 }}>
      <Mark concept={concept} variant={variant} size={size} />
      <span className="font-semibold tracking-tight" style={{ fontSize: size * 0.72, lineHeight: 1 }}>
        brainy
      </span>
    </span>
  );
}

// Rounded-square app icon: white mark on black (mono) or on the gradient (colour).
export function AppIcon({ concept, variant = "mono", size = 96 }: { concept: Concept; variant?: Variant; size?: number }) {
  const background =
    variant === "color"
      ? `linear-gradient(135deg, ${PALETTE.violet}, ${PALETTE.pink} 55%, ${PALETTE.orange})`
      : "#0a0a0a";
  return (
    <span
      className="grid place-items-center text-white shadow-md ring-1 ring-white/15"
      style={{ width: size, height: size, borderRadius: size * 0.225, background }}
    >
      <Mark concept={concept} size={size * 0.6} />
    </span>
  );
}

// A browser tab with the 16px favicon, to judge it at real size.
export function FaviconTab({ concept, dark }: { concept: Concept; dark: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-t-lg border border-b-0 px-3 py-1.5 text-xs ${
        dark ? "border-neutral-700 bg-neutral-800 text-neutral-200" : "border-neutral-300 bg-neutral-100 text-neutral-800"
      }`}
    >
      <Mark concept={concept} size={16} />
      Brainy
      <span className="ml-3 opacity-50">×</span>
    </span>
  );
}

// Scaled-down 1200×630 social card.
export function OgCard({ concept, variant }: { concept: Concept; variant: Variant }) {
  return (
    <div className="relative aspect-[1200/630] w-full max-w-md overflow-hidden rounded-xl border border-neutral-200 bg-white text-[#0a0a0a]">
      {variant === "color" && (
        <div
          aria-hidden
          className="absolute -right-1/4 -top-1/2 h-[150%] w-[90%] rotate-12 opacity-80 blur-2xl"
          style={{
            background: `linear-gradient(120deg, ${PALETTE.violet}, ${PALETTE.pink}, ${PALETTE.orange}, ${PALETTE.cyan})`,
          }}
        />
      )}
      <div className="relative flex h-full flex-col justify-between p-[6%]">
        <Lockup concept={concept} variant={variant} size={30} />
        <p className="max-w-[70%] text-lg font-semibold leading-tight tracking-tight">
          Turn a half-baked idea into genuinely different finished versions.
        </p>
      </div>
    </div>
  );
}
