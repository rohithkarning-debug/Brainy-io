"use client";

import { useId, useState } from "react";
import { MAX_GENERATORS, contextLabel, priceLabel, type ModelHealth, type ModelInfo } from "@/lib/run-plan";

const HEALTH: Record<ModelHealth, { dot: string; label: string }> = {
  available: { dot: "bg-emerald-500", label: "Available" },
  busy: { dot: "bg-amber-500", label: "Busy right now (rate-limited), skipped by Auto" },
  unavailable: { dot: "bg-slate-300", label: "Unavailable" },
};

export function HealthDot({ health }: { health: ModelHealth }) {
  return (
    <span title={HEALTH[health].label} className="inline-flex shrink-0 items-center">
      <span aria-hidden className={`h-2 w-2 rounded-full ${HEALTH[health].dot}`} />
      <span className="sr-only">{HEALTH[health].label}</span>
    </span>
  );
}

// How many paid matches to show at once; the search box narrows the rest.
const PAID_SHOWN = 20;

/**
 * Pick 1-4 generator models, or Auto ([]). Free models are always listed;
 * own-key users can also search the paid ones.
 */
export function GeneratorPicker({
  models,
  value,
  onChange,
  ownKey,
}: {
  models: ModelInfo[] | null;
  value: string[];
  onChange: (models: string[]) => void;
  ownKey: boolean;
}) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const auto = value.length === 0;
  const free = models?.filter((m) => m.free) ?? [];
  const known = new Set(models?.map((m) => m.id) ?? []);
  // Picks that can't run here (e.g. paid models after removing your own key) are ignored by the server.
  const ignored = models ? value.filter((id) => !known.has(id)) : [];

  const q = query.trim().toLowerCase();
  const paid = ownKey
    ? (models ?? [])
        .filter((m) => !m.free && (value.includes(m.id) || (q !== "" && `${m.id} ${m.name}`.toLowerCase().includes(q))))
        .slice(0, PAID_SHOWN)
    : [];

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((m) => m !== id));
    else if (value.length < MAX_GENERATORS) onChange([...value.filter((m) => known.has(m)), id]);
  }

  return (
    <fieldset>
      <legend className="text-sm font-semibold text-slate-950">Generator models</legend>
      <p className="mt-0.5 text-xs text-slate-500">
        Directions are spread across the models you pick (up to {MAX_GENERATORS}). Auto uses 3 healthy free models and
        skips busy ones.
      </p>

      <label className="mt-3 flex cursor-pointer items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.04]">
        <input type="checkbox" checked={auto} onChange={() => onChange([])} disabled={auto} className="accent-accent" />
        <span className="font-medium text-slate-900">Auto</span>
        <span className="text-xs text-slate-500">(recommended)</span>
      </label>

      {models === null ? (
        <p className="mt-2 text-xs text-slate-400">Loading models…</p>
      ) : (
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {[...free, ...paid].map((m) => {
            const checked = value.includes(m.id);
            const full = !checked && value.length >= MAX_GENERATORS;
            return (
              <li key={m.id}>
                <label
                  className={`flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm transition has-[:checked]:border-accent/40 has-[:checked]:bg-accent/[0.04] ${
                    full || m.health === "unavailable" ? "opacity-50" : "cursor-pointer hover:border-slate-300"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={full || (m.health === "unavailable" && !checked)}
                    onChange={() => toggle(m.id)}
                    className="accent-accent"
                  />
                  <HealthDot health={m.health} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-slate-900" title={m.id}>
                      {m.name}
                    </span>
                    <span className="block text-xs text-slate-400">
                      {contextLabel(m.context)} context · {priceLabel(m)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {ownKey && models !== null && (
        <div className="mt-3">
          <label htmlFor={searchId} className="text-xs font-medium text-slate-500">
            Paid models (billed to your key)
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search, e.g. claude, gpt, gemini"
            className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          />
        </div>
      )}

      {ignored.length > 0 && (
        <p className="mt-2 text-xs text-amber-700">
          {ignored.length === 1 ? "One pick isn't" : `${ignored.length} picks aren't`} available here and will be skipped.
        </p>
      )}
    </fieldset>
  );
}

/** "Auto (recommended)" or any listed model. Free first by context size; paid (own key) after, with prices. */
export function JudgeSelect({
  id,
  models,
  value,
  onChange,
  ownKey,
  className = "",
}: {
  id: string;
  models: ModelInfo[] | null;
  value: string;
  onChange: (judge: string) => void;
  ownKey: boolean;
  className?: string;
}) {
  const free = [...(models ?? []).filter((m) => m.free)].sort((a, b) => b.context - a.context);
  const paid = ownKey ? (models ?? []).filter((m) => !m.free) : [];
  const listed = value === "auto" || (models ?? []).some((m) => m.id === value);
  const option = (m: ModelInfo) => (
    <option key={m.id} value={m.id} disabled={m.health === "unavailable"}>
      {m.name} · {contextLabel(m.context)}
      {m.free ? "" : ` · ${priceLabel(m)}`}
      {m.health === "available" ? "" : ` · ${m.health}`}
    </option>
  );
  return (
    <select
      id={id}
      value={listed ? value : "auto"}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-slate-900 outline-none focus:border-accent/60 focus:ring-4 focus:ring-accent/10 ${className}`}
    >
      <option value="auto">Auto (recommended): best healthy free judge</option>
      {free.length > 0 && <optgroup label="Free models">{free.map(option)}</optgroup>}
      {paid.length > 0 && <optgroup label="Paid models (billed to your key)">{paid.map(option)}</optgroup>}
    </select>
  );
}
