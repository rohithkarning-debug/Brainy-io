"use client"; // Disclosure and Tabs keep state

import { useId, useState, type KeyboardEvent, type ReactNode } from "react";

// Small helpers to keep headings consistent.
export function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-accent">{eyebrow}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{children}</p>;
}

// Line icons (24px grid, drawn with the current text color).
const ICONS = {
  copy: (
    <>
      <rect width="14" height="14" x="8" y="8" rx="2" />
      <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
    </>
  ),
  share: (
    <>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
    </>
  ),
  bookmark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />,
  trash: (
    <>
      <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
    </>
  ),
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
    </>
  ),
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  close: <path d="M18 6 6 18M6 6l12 12" />,
  search: (
    <>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </>
  ),
  sparkle: <path d="M12 3l1.9 5.6L19.5 10.5l-5.6 1.9L12 18l-1.9-5.6L4.5 10.5l5.6-1.9z" />,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "h-4 w-4", filled = false }: { name: IconName; className?: string; filled?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {ICONS[name]}
    </svg>
  );
}

// A small label that appears above its child on hover or keyboard focus.
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-slate-50 opacity-0 shadow-card transition-opacity duration-150 group-focus-within/tip:opacity-100 group-hover/tip:opacity-100"
      >
        {label}
      </span>
    </span>
  );
}

// Round icon-only button with a tooltip; `label` doubles as its accessible name.
export function IconButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={icon === "bookmark" ? active : undefined}
        onClick={onClick}
        disabled={disabled}
        className={`grid h-8 w-8 place-items-center rounded-full transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 ${
          active ? "text-accent" : "text-slate-400 hover:text-slate-700"
        }`}
      >
        <Icon name={icon} filled={active && icon === "bookmark"} />
      </button>
    </Tooltip>
  );
}

// Pill button used for page-level actions (Regenerate, Save, Stop...).
export function ActionButton({
  icon,
  children,
  onClick,
  variant = "plain",
  pressed,
  disabled = false,
}: {
  icon: IconName;
  children: ReactNode;
  onClick: () => void;
  variant?: "plain" | "danger";
  pressed?: boolean;
  disabled?: boolean;
}) {
  const colors =
    variant === "danger"
      ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100/70"
      : pressed
        ? "border-accent/30 bg-accent/10 text-accent"
        : "border-slate-950 bg-surface text-slate-950 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium shadow-card transition disabled:cursor-not-allowed disabled:opacity-40 ${colors}`}
    >
      <Icon name={icon} filled={pressed && icon === "bookmark"} />
      {children}
    </button>
  );
}

// A heading that shows or hides the content under it, with a smooth height change.
export function Disclosure({
  summary,
  defaultOpen = true,
  children,
}: {
  summary: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        {summary}
        <Icon name="chevron" className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {/* grid-rows 0fr -> 1fr animates to the content's natural height */}
      <div
        id={id}
        inert={!open}
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </div>
  );
}

// Accessible tab strip: arrow keys move between tabs, Home/End jump to the ends.
// Pair each tab with <TabPanel id=...>.
export function Tabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: ReactNode }[];
  active: T;
  onChange: (id: T) => void;
}) {
  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next =
      e.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : e.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : e.key === "Home" ? 0
      : e.key === "End" ? last
      : null;
    if (next === null) return;
    e.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label={label}
      className="inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface/80 p-1 shadow-card backdrop-blur"
    >
      {tabs.map((tab, i) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              selected ? "bg-slate-900 text-slate-50 shadow-card" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={!active} tabIndex={0} className="mt-8 rounded-3xl">
      {active && children}
    </div>
  );
}

// Keyboard key hint, e.g. <Kbd>Ctrl</Kbd>.
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-surface px-1.5 py-px font-mono text-[0.7rem] font-medium text-slate-500 shadow-card">
      {children}
    </kbd>
  );
}

export type Choice<T extends string> = { value: T; label: string; hint?: string };

// A row of options built on real radio inputs, so arrow keys and screen readers work out of the box.
export function Segmented<T extends string>({
  name,
  legend,
  choices,
  value,
  onChange,
}: {
  name: string;
  legend: string;
  choices: Choice<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="shrink-0">
      <legend className="sr-only">{legend}</legend>
      <div className="inline-flex rounded-xl bg-slate-100 p-1">
        {choices.map((c) => {
          const checked = c.value === value;
          return (
            <label
              key={c.value}
              title={c.hint}
              className={`cursor-pointer rounded-lg px-3.5 py-2 text-sm font-medium transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${
                checked ? "bg-surface text-slate-950 shadow-card ring-1 ring-slate-900/5" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={c.value}
                checked={checked}
                onChange={() => onChange(c.value)}
                className="sr-only"
              />
              {c.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// On/off toggle. `size` "sm" fits inside a form row.
export function Switch({
  label,
  checked,
  onChange,
  size = "md",
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: "sm" | "md";
}) {
  const sm = size === "sm";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 rounded-full transition-colors ${sm ? "h-5 w-9" : "h-7 w-12"} ${checked ? "bg-accent" : "bg-slate-300"}`}
    >
      <span
        className={`absolute rounded-full bg-white shadow-card transition-transform ${sm ? "left-0.5 top-0.5 h-4 w-4" : "left-1 top-1 h-5 w-5"} ${checked ? (sm ? "translate-x-4" : "translate-x-5") : ""}`}
      />
    </button>
  );
}
