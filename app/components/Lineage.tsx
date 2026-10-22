"use client";

import Link from "next/link";
import { useState } from "react";
import { LineageTree } from "@/app/components/LineageTree";
import { useToast } from "@/app/components/Toast";
import { ActionButton, Icon, Label } from "@/app/components/ui";
import { VersionCard } from "@/app/components/VersionCard";
import { isBreedError, judgeGeneration, toggleOffspringSaved, type BreedError } from "@/lib/breed";
import type { Result } from "@/lib/history";
import { MAX_JUDGED, OFFSPRING_PER_CROSS, findIdea, offspringNodeId, type Lineage, type NodeId } from "@/lib/lineage";
import type { Version } from "@/lib/openrouter";

// ---------- The sticky "Cross" bar (Directions and Lineage tabs) ----------

export function CrossBar({
  result,
  lineage,
  selected,
  onRemove,
  onCross,
  crossing,
  error,
}: {
  result: Result;
  lineage: Lineage;
  selected: NodeId[];
  onRemove: (id: NodeId) => void;
  onCross: () => void;
  crossing: boolean;
  error: BreedError | null;
}) {
  const picked = selected.map((id) => ({ id, found: findIdea(result.versions, lineage, id) }));
  return (
    <div className="sticky bottom-4 z-30 mt-8">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface/95 p-3 shadow-lift backdrop-blur sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-950">
            Breed ideas <span className="font-normal text-slate-500">· {selected.length} of 2 selected</span>
          </p>
          {picked.length === 0 ? (
            <p className="text-xs text-slate-500">Select two ideas, then cross them into {OFFSPRING_PER_CROSS} offspring (1 run).</p>
          ) : (
            <ul className="mt-1.5 flex flex-wrap gap-1.5">
              {picked.map(({ id, found }) => (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onRemove(id)}
                    aria-label={`Unselect ${found?.idea.title ?? id}`}
                    className="inline-flex max-w-[16rem] items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-xs font-medium text-accent hover:bg-accent/15"
                  >
                    <span className="truncate">{found?.idea.title ?? id}</span>
                    <Icon name="close" className="h-3 w-3 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={onCross}
          disabled={selected.length !== 2 || crossing}
          aria-describedby={selected.length !== 2 ? "cross-hint" : undefined}
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
        >
          {crossing ? "Crossing…" : "Cross"} <span aria-hidden>✕</span>
        </button>
        <span id="cross-hint" className="sr-only">
          Select exactly two ideas to cross them.
        </span>
        {error && <BreedNote error={error} />}
      </div>
    </div>
  );
}

/** A breeding error, with a way forward when it's about limits or keys. */
export function BreedNote({ error }: { error: BreedError }) {
  const settingsLink = error.keyProblem || error.limited || error.outOfJuice;
  return (
    <p role="alert" className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      {error.error}{" "}
      {settingsLink && (
        <Link href="/settings#api-keys" className="font-semibold underline underline-offset-2">
          {error.keyProblem ? "Open Settings" : "Add your own free OpenRouter key"} <span aria-hidden>→</span>
        </Link>
      )}
    </p>
  );
}

// ---------- The Lineage tab ----------

export function LineagePanel({
  result,
  versions,
  lineage,
  selected,
  canSelect,
  onToggle,
  freshIds,
  stored,
}: {
  result: Result;
  versions: Version[]; // in direction order
  lineage: Lineage;
  selected: NodeId[];
  canSelect: (id: NodeId) => boolean;
  onToggle: (id: NodeId) => void;
  freshIds: Set<string>;
  stored: boolean;
}) {
  const toast = useToast();
  const [focused, setFocused] = useState<NodeId | null>(null);
  const [judging, setJudging] = useState<number | null>(null);
  const [judgeError, setJudgeError] = useState<{ generation: number; error: BreedError } | null>(null);

  const generations = [...new Set(lineage.offspring.map((o) => o.generation))].sort((a, b) => a - b);
  const pickIds = new Set(lineage.verdicts.map((v) => v.pickId));
  const focusedIdea = focused ? findIdea(versions, lineage, focused) : null;

  async function judge(generation: number, ids: string[]) {
    setJudging(generation);
    setJudgeError(null);
    const verdict = await judgeGeneration(result, generation, ids);
    setJudging(null);
    if (isBreedError(verdict)) setJudgeError({ generation, error: verdict });
    else toast(`Generation ${generation} judged`);
  }

  return (
    <div>
      <div className="mb-6 max-w-2xl">
        <p className="text-sm font-semibold text-accent">Lineage</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-3xl">Your idea&apos;s family tree</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Select any two ideas (directions or offspring) and press Cross. Each cross breeds {OFFSPRING_PER_CROSS} offspring that
          combine both parents, and counts as 1 run. Keep crossing for generation 2, 3 and beyond.
        </p>
      </div>

      <LineageTree
        idea={result.idea}
        versions={versions}
        lineage={lineage}
        selected={selected}
        canSelect={canSelect}
        onToggle={onToggle}
        onOpen={setFocused}
        freshIds={freshIds}
        pickIds={pickIds}
      />

      {/* What the last clicked node is, without leaving the tree */}
      {focusedIdea && (
        <div aria-live="polite" className="mt-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
          <p className="text-xs font-semibold text-accent">{focusedIdea.idea.direction}</p>
          <p className="mt-1 font-semibold text-slate-950">{focusedIdea.idea.title}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{focusedIdea.idea.pitch}</p>
          {focusedIdea.offspring && (
            <>
              <p className="mt-1 text-xs italic text-slate-500">{focusedIdea.offspring.inherits}</p>
              <button
                type="button"
                onClick={() => document.getElementById(`card-${focused}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="mt-2 text-xs font-semibold text-accent hover:underline"
              >
                Show its card <span aria-hidden>↓</span>
              </button>
            </>
          )}
        </div>
      )}

      {generations.length === 0 && (
        <p className="mt-8 rounded-2xl border border-dashed border-line p-6 text-center text-sm text-slate-500">
          No offspring yet. Pick two directions in the tree above (or on the Directions tab) and press Cross.
        </p>
      )}

      {generations.map((g) => {
        const kids = lineage.offspring.filter((o) => o.generation === g);
        const chosen = kids.filter((o) => selected.includes(offspringNodeId(o.id))).map((o) => o.id);
        // Judge the selected offspring of this generation, or all of it (newest first, capped).
        const toJudge = chosen.length >= 2 ? chosen : kids.slice(-MAX_JUDGED).map((o) => o.id);
        const verdict = lineage.verdicts.find((v) => v.generation === g);
        const picked = verdict && kids.find((o) => o.id === verdict.pickId);
        return (
          <section key={g} aria-labelledby={`gen-${g}`} className="mt-12">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Label>Generation {g}</Label>
                <h3 id={`gen-${g}`} className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950">
                  {kids.length} offspring
                </h3>
              </div>
              <ActionButton icon="sparkle" onClick={() => judge(g, toJudge)} disabled={!stored || toJudge.length < 2 || judging !== null}>
                {judging === g
                  ? "Judging…"
                  : chosen.length >= 2
                    ? `Judge selected (${chosen.length})`
                    : "Judge this generation"}
              </ActionButton>
            </div>

            {judgeError?.generation === g && (
              <div className="mt-4">
                <BreedNote error={judgeError.error} />
              </div>
            )}

            {verdict && picked && (
              <div className="mt-5 rounded-2xl border border-accent/25 bg-accent/[0.05] p-5">
                <p className="text-xs font-semibold text-accent">Brainy&apos;s pick from generation {g}</p>
                <p className="mt-1 text-lg font-semibold text-slate-950">{picked.title}</p>
                {verdict.why && <p className="mt-1 text-sm leading-relaxed text-slate-700">{verdict.why}</p>}
                <p className="mt-2 font-mono text-xs text-slate-400">judged by {verdict.model}</p>
              </div>
            )}

            <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {kids.map((o, i) => {
                const node = offspringNodeId(o.id);
                return (
                  <VersionCard
                    key={o.id}
                    id={`card-${node}`}
                    version={o}
                    purpose={result.purpose}
                    colorIndex={i}
                    detailsOpen={false}
                    inherits={o.inherits}
                    fresh={freshIds.has(o.id)}
                    picked={verdict?.pickId === o.id}
                    note={verdict?.notes.find((n) => n.id === o.id)?.note}
                    save={
                      stored
                        ? {
                            saved: Boolean(o.saved),
                            onToggle: () => toast(toggleOffspringSaved(result.id, o.id) ? "Saved to favorites" : "Removed from saved"),
                          }
                        : undefined
                    }
                    select={{
                      checked: selected.includes(node),
                      disabled: !selected.includes(node) && !canSelect(node),
                      onChange: () => onToggle(node),
                    }}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
