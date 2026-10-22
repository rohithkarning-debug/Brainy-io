import { sourceList } from "@/lib/format";
import { PURPOSES, PURPOSE_KEYS, type Purpose } from "@/lib/purposes";

// Three-way segmented control: Startup / Hackathon / Research.
// A white pill slides under the active option.
export function PurposePicker({
  value,
  onChange,
  disabled,
}: {
  value: Purpose;
  onChange: (p: Purpose) => void;
  disabled: boolean;
}) {
  const index = PURPOSE_KEYS.indexOf(value);
  // Tailwind needs full class names written out, so pick from a list.
  const slide = ["translate-x-0", "translate-x-full", "translate-x-[200%]"][index];

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">What&apos;s it for?</p>
      <div role="radiogroup" aria-label="What is this idea for?" className="relative grid grid-cols-3 rounded-xl bg-slate-100 p-1">
        {/* The sliding pill */}
        <span
          aria-hidden
          className={`absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/3)] rounded-lg bg-surface shadow-card ring-1 ring-slate-900/5 transition-transform duration-300 ease-out ${slide}`}
        />
        {PURPOSE_KEYS.map((key) => {
          const active = key === value;
          return (
            <button
              key={key}
              role="radio"
              aria-checked={active}
              disabled={disabled}
              onClick={() => onChange(key)}
              className={`relative z-10 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed ${
                active ? "text-slate-950" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {PURPOSES[key].label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {PURPOSES[value].tagline} · <span className="text-slate-400">searches {sourceList(PURPOSES[value].sources)}</span>
      </p>
    </div>
  );
}
