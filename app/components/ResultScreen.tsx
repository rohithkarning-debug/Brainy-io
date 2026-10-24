"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useLayoutEffect, useState } from "react";
import { BrainyTakeCard } from "@/app/components/BrainyTakeCard";
import { CookingLoader, SkeletonCard } from "@/app/components/CookingLoader";
import { useCopyShare } from "@/app/components/CopyShare";
import { CrossBar, LineagePanel } from "@/app/components/Lineage";
import { JudgeSelect } from "@/app/components/ModelPicker";
import { BuiltBeforeCard, PapersCard } from "@/app/components/PriorWorkCards";
import { useToast } from "@/app/components/Toast";
import { ActionButton, SectionTitle, TabPanel, Tabs } from "@/app/components/ui";
import { VersionCard } from "@/app/components/VersionCard";
import { crossNodes, isBreedError, type BreedError } from "@/lib/breed";
import { formatDate, resultToText, sourceList } from "@/lib/format";
import { togglePin, useHistory, type Result } from "@/lib/history";
import { useKeys } from "@/lib/keys";
import { directionNodeId, readLineage, type Lineage, type NodeId } from "@/lib/lineage";
import { useModels } from "@/lib/models";
import { PURPOSES } from "@/lib/purposes";
import { rejudge, startRun, stopRun, useRun } from "@/lib/run";
import { setPublic, useSync } from "@/lib/sync";
import { setCooked } from "@/lib/reveal";
import { runOptions, updateSettings, useMotionAllowed, useSettings } from "@/lib/settings";
import { LENGTHS, TONES } from "@/lib/style";

type Tab = "verdict" | "directions" | "baseline" | "lineage";

/** /result/[id]: a run still cooking in this tab, or a result from history. */
export function ResultScreen({ id }: { id: string }) {
  const live = useRun(id);
  const history = useHistory();
  const saved = history?.find((r) => r.id === id) ?? null;
  const result = live ?? saved;

  if (!result) return history === null ? <ResultSkeleton /> : <NotFound />;
  // key: a fresh view (tabs, toggles) for every result
  // Bred ideas are only ever written to the stored copy, so read them from there.
  return (
    <ResultView
      key={id}
      result={result}
      live={live !== null}
      pinned={saved?.pinned ?? false}
      stored={saved !== null}
      lineage={saved?.lineage}
      shareSlug={saved?.shareSlug}
    />
  );
}

/**
 * One result with its tabs. `example` is the static sample on the home page:
 * no page actions, and it never turns the page to colour (that is only for real results).
 * `shared` is a public result at /r/[slug]: read-only, but a real cooked
 * result, so it shows in colour.
 */
export function ResultView({
  result,
  live = false,
  pinned = false,
  stored = false,
  example = false,
  shared = false,
  lineage: storedLineage,
  shareSlug,
}: {
  result: Result;
  live?: boolean;
  pinned?: boolean;
  stored?: boolean;
  example?: boolean;
  shared?: boolean;
  lineage?: Lineage;
  shareSlug?: string;
}) {
  const readOnly = example || shared;
  const router = useRouter();
  const toast = useToast();
  const { copy, share } = useCopyShare();
  const settings = useSettings();
  const hasOwnKey = Boolean(useKeys().openrouter);
  const sync = useSync();
  const [publishing, setPublishing] = useState(false);
  const [tab, setTab] = useState<Tab>("verdict");
  const [detailsOpen, setDetailsOpen] = useState(true);

  const { purpose } = result;
  const cooking = result.status === "cooking";
  // The directions this run used (older results ran all of them, plus the baseline).
  const planned = result.plan?.directions;
  const directions = PURPOSES[purpose].directions.filter((d) => !planned || planned.includes(d.label));
  const baselineOn = result.plan?.baseline ?? true;
  const hasContent = Boolean(result.baseline || result.versions.length > 0 || result.take);

  // ---------- The reveal: monochrome while cooking, colour once it's done ----------
  const motion = useMotionAllowed();
  const finished = !cooking && hasContent;
  // Opened already finished (from History or Saved): in colour straight away.
  // A layout effect, so that case never paints a frame in black and white.
  const [openedFinished] = useState(finished);
  useLayoutEffect(() => {
    if (finished && !example) setCooked(true, { animate: !openedFinished });
  }, [finished, openedFinished, example]);
  // Back to black and white on leaving the result.
  useEffect(() => () => setCooked(false, { animate: false }), []);

  function replayReveal() {
    setCooked(false, { animate: false });
    // Wait for the instant switch back to mono to paint, then bloom again.
    setTimeout(() => setCooked(true), 80);
  }

  // ---------- Breeding: pick two ideas, cross them into offspring ----------
  const lineage = readLineage(storedLineage);
  // Only on a finished, stored result (bred ideas are saved into it), never the home-page sample.
  const canBreed = finished && stored && !example;
  const [selected, setSelected] = useState<NodeId[]>([]);
  const [crossing, setCrossing] = useState(false);
  const [crossError, setCrossError] = useState<BreedError | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(() => new Set());
  // Directions in their usual order, for the tree.
  const orderedVersions = directions.flatMap((d) => result.versions.filter((v) => v.direction === d.label));

  function toggleSelected(id: NodeId) {
    setCrossError(null);
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < 2 ? [...s, id] : s));
  }
  const canSelect = (id: NodeId) => selected.includes(id) || selected.length < 2;

  async function cross() {
    if (selected.length !== 2) return;
    setCrossing(true);
    setCrossError(null);
    const born = await crossNodes(result, [selected[0], selected[1]]);
    setCrossing(false);
    if (isBreedError(born)) {
      setCrossError(born);
      return;
    }
    setFreshIds((f) => new Set([...f, ...born]));
    setSelected([]);
    setTab("lineage");
    toast(`${born.length} new ideas bred`);
  }

  // The direction the judge built its pick on gets highlighted after the reveal.
  const pickedDirection = result.take?.pick.basedOn.trim().toLowerCase();

  // Same idea and purpose, with the current answer and run settings.
  function regenerate() {
    const run = runOptions(settings, hasOwnKey);
    const id = startRun({ idea: result.idea, purpose, length: settings.length, tone: settings.tone, ...run });
    router.push(`/result/${id}`);
  }

  // Public link at /r/<slug>: only for synced results (the page reads the cloud copy).
  const publicUrl = shareSlug ? `${typeof location === "undefined" ? "" : location.origin}/r/${shareSlug}` : null;
  async function togglePublic() {
    setPublishing(true);
    try {
      const slug = await setPublic(result.id, !shareSlug);
      if (slug) {
        await navigator.clipboard?.writeText(`${location.origin}/r/${slug}`).catch(() => {});
        toast("Public link copied");
      } else {
        toast("This result is private again");
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't change sharing");
    } finally {
      setPublishing(false);
    }
  }

  function pin() {
    toast(togglePin(result.id) ? "Saved to favorites" : "Removed from saved");
  }

  // The honest status line under the cooking animation.
  const arrived = result.versions.length + (result.baseline ? 1 : 0);
  const total = directions.length + (baselineOn ? 1 : 0);
  const progress = [
    result.search
      ? result.search.ran.length > 0
        ? `Searched ${sourceList(result.search.ran)}`
        : "Search skipped"
      : "Searching for similar work",
    `${arrived} of ${total} versions ready`,
    arrived > 0 ? "the judge is up next" : "models are thinking",
  ].join(" · ");

  const tabs: { id: Tab; label: React.ReactNode }[] = [
    {
      id: "verdict",
      label: (
        <>
          Verdict
          {cooking && !result.take && <span aria-hidden className="animate-dot h-1.5 w-1.5 rounded-full bg-accent" />}
        </>
      ),
    },
    {
      id: "directions",
      label: (
        <>
          Directions
          <span className="rounded-full bg-slate-200/70 px-1.5 text-xs tabular-nums">
            {result.versions.length}
            {cooking && `/${directions.length}`}
          </span>
        </>
      ),
    },
    { id: "baseline", label: "Baseline" },
    ...(canBreed
      ? [
          {
            id: "lineage" as const,
            label: (
              <>
                Lineage
                {lineage.offspring.length > 0 && (
                  <span className="rounded-full bg-slate-200/70 px-1.5 text-xs tabular-nums">{lineage.offspring.length}</span>
                )}
              </>
            ),
          },
        ]
      : []),
  ];

  const Heading = example ? "h3" : "h1";

  return (
    // Frosted panel once cooked, so text stays readable over the colour.
    // The padding is always there, so nothing shifts when it appears.
    <div className="-mx-4 mt-6 rounded-[2rem] border border-transparent p-4 transition-colors duration-1000 sm:-mx-8 sm:mt-10 sm:p-8 cooked:border-line cooked:bg-surface/80 cooked:shadow-hero cooked:backdrop-blur-xl">
      {/* ---------- Header: the idea and page actions ---------- */}
      {shared ? (
        <p className="mb-5 text-sm text-slate-500">
          A shared Brainy result, read-only.{" "}
          <Link href="/ask" className="font-medium text-slate-950 underline underline-offset-2">
            Cook your own idea <span aria-hidden>→</span>
          </Link>
        </p>
      ) : (
        !example && (
          <Link href="/ask" className="mb-5 inline-block text-sm font-medium text-slate-500 transition hover:text-slate-900">
            <span aria-hidden>←</span> New idea
          </Link>
        )
      )}
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="rounded-full bg-accent/10 px-2.5 py-1 font-semibold text-accent">{PURPOSES[purpose].label}</span>
        <span>{example ? "Sample run" : formatDate(result.createdAt)}</span>
        <span aria-hidden>·</span>
        <span>
          {LENGTHS[result.length].label}, {TONES[result.tone].label.toLowerCase()}
        </span>
      </div>
      <Heading className="mt-3 line-clamp-4 max-w-4xl text-2xl font-semibold leading-snug tracking-[-0.03em] text-slate-950 sm:text-3xl">
        {result.idea}
      </Heading>

      <div className="mt-6 flex flex-wrap gap-2">
        {readOnly ? null : cooking ? (
          <ActionButton icon="stop" variant="danger" onClick={() => stopRun(result.id)}>
            Stop generating
          </ActionButton>
        ) : (
          // A hit limit or empty fuel tank can't be retried, unless they've since added their own key.
          (hasOwnKey || (!result.limited && !result.outOfJuice)) && (
            <ActionButton icon="refresh" onClick={regenerate}>
              Regenerate
            </ActionButton>
          )
        )}
        {shared && hasContent && (
          <ActionButton icon="copy" onClick={() => copy(resultToText(result))}>
            Copy all
          </ActionButton>
        )}
        {hasContent && !readOnly && (
          <>
            <ActionButton icon="bookmark" pressed={pinned} disabled={!stored} onClick={pin}>
              {pinned ? "Saved" : "Save"}
            </ActionButton>
            <ActionButton icon="copy" onClick={() => copy(resultToText(result))}>
              Copy all
            </ActionButton>
            <ActionButton icon="share" onClick={() => share(`Brainy: ${result.idea}`, resultToText(result))}>
              Share
            </ActionButton>
          </>
        )}
        {finished && stored && !readOnly && sync.enabled && (
          <ActionButton icon="link" pressed={Boolean(shareSlug)} disabled={publishing} onClick={() => void togglePublic()}>
            {publishing ? "Updating…" : shareSlug ? "Public" : "Make public"}
          </ActionButton>
        )}
        {finished && motion && !example && (
          <ActionButton icon="sparkle" onClick={replayReveal}>
            Replay reveal
          </ActionButton>
        )}
      </div>
      {publicUrl && !readOnly && sync.enabled && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          Anyone with the link can view this result:
          <a href={publicUrl} target="_blank" rel="noreferrer" className="font-mono text-slate-700 underline underline-offset-2">
            {publicUrl.replace(/^https?:\/\//, "")}
          </a>
          · press <strong className="font-medium">Public</strong> to make it private again.
        </p>
      )}

      {/* ---------- Notes: limit, out of juice, error, stopped ---------- */}
      {result.limited || result.keyProblem ? (
        <p className="mt-8 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          {result.error}{" "}
          {(result.keyProblem || !hasOwnKey) && (
            <Link href="/settings#api-keys" className="font-semibold underline underline-offset-2">
              {result.keyProblem ? "Open Settings" : "Add a key in Settings"} <span aria-hidden>→</span>
            </Link>
          )}
        </p>
      ) : result.outOfJuice ? (
        <OutOfJuice />
      ) : result.status === "error" ? (
        <div role="alert" className="mt-8 flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-700">
          <p>
            <span className="font-semibold">Oops, that one burned.</span> {result.error}
          </p>
          <ActionButton icon="refresh" onClick={regenerate}>
            Retry
          </ActionButton>
        </div>
      ) : result.ranDry ? (
        <p className="mt-8 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Today&apos;s shared free requests ran out mid-run, so some pieces may be missing.{" "}
          {!hasOwnKey && (
            <Link href="/settings#api-keys" className="font-semibold underline underline-offset-2">
              Add your own free OpenRouter key <span aria-hidden>→</span>
            </Link>
          )}
        </p>
      ) : result.status === "stopped" ? (
        <p className="mt-8 max-w-3xl rounded-xl border border-line bg-surface p-4 text-sm text-slate-600 shadow-card">
          You stopped this run.{" "}
          {hasContent ? "Here's everything that arrived before you did." : "Nothing had arrived yet."}
        </p>
      ) : null}

      {/* ---------- Results ---------- */}
      {(hasContent || cooking) && (
        <div className="mt-10">
          <Tabs label="Result sections" tabs={tabs} active={tab} onChange={setTab} />

          <TabPanel id="verdict" active={tab === "verdict"}>
            {result.take ? (
              <>
                <BrainyTakeCard
                  take={result.take}
                  search={result.search ?? { ran: [], skipped: [] }}
                  purpose={purpose}
                  live={live}
                />
                {purpose === "hackathon" && <BuiltBeforeCard built={result.take.builtBefore} search={result.search} />}
                {purpose === "research" && <PapersCard report={result.take.papers} search={result.search} />}
              </>
            ) : cooking ? (
              <div className="rounded-3xl border border-line bg-surface/70 shadow-card backdrop-blur">
                <CookingLoader progress={progress} />
                {result.versions.length > 0 && (
                  <div className="-mt-4 pb-10 text-center">
                    <button
                      type="button"
                      onClick={() => setTab("directions")}
                      className="text-sm font-medium text-accent hover:underline"
                    >
                      Peek at the {result.versions.length} direction{result.versions.length === 1 ? "" : "s"} already done →
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface p-4 shadow-card">
                <p className="text-sm text-slate-500">
                  {result.status === "done"
                    ? "Brainy's Take couldn't be generated this time, but the directions are ready."
                    : "The run ended before the judge could weigh in, but the directions that arrived are ready."}
                </p>
                {!readOnly && hasContent && <RejudgeBox result={result} ownKey={hasOwnKey} />}
              </div>
            )}
          </TabPanel>

          <TabPanel id="directions" active={tab === "directions"}>
            <SectionTitle
              eyebrow={`${result.versions.length} directions`}
              title="Different takes on your idea"
              action={
                result.versions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDetailsOpen((o) => !o)}
                    className="text-sm font-medium text-slate-500 hover:text-slate-900"
                  >
                    {detailsOpen ? "Collapse all details" : "Expand all details"}
                  </button>
                )
              }
            />
            {cooking && (
              <p role="status" className="-mt-3 mb-6 text-sm text-slate-500">
                {progress}
              </p>
            )}
            {/* Cards keep their direction's slot; skeletons fill the ones still cooking.
                The key on the grid re-opens/closes every card when "all" is toggled. */}
            <div key={String(detailsOpen)} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {directions.map((d, i) => {
                const version = result.versions.find((v) => v.direction === d.label);
                if (version) {
                  const node = directionNodeId(d.label);
                  return (
                    <VersionCard
                      key={d.label}
                      version={version}
                      purpose={purpose}
                      live={live}
                      detailsOpen={detailsOpen}
                      colorIndex={i}
                      picked={d.label.toLowerCase() === pickedDirection}
                      select={
                        canBreed
                          ? { checked: selected.includes(node), disabled: !canSelect(node), onChange: () => toggleSelected(node) }
                          : undefined
                      }
                    />
                  );
                }
                return cooking ? <SkeletonCard key={d.label} label={d.label} /> : null;
              })}
            </div>
          </TabPanel>

          <TabPanel id="baseline" active={tab === "baseline"}>
            <SectionTitle eyebrow="For comparison" title="What a typical AI would say" />
            <div className="max-w-xl">
              {result.baseline ? (
                <VersionCard version={result.baseline} purpose={purpose} muted live={live} />
              ) : !baselineOn ? (
                <p className="text-sm text-slate-500">The baseline was off for this run. Turn it on under Advanced on the Ask page.</p>
              ) : cooking ? (
                <SkeletonCard label="Baseline" />
              ) : (
                <p className="text-sm text-slate-500">The baseline didn&apos;t come through this time.</p>
              )}
            </div>
          </TabPanel>

          {canBreed && (
            <TabPanel id="lineage" active={tab === "lineage"}>
              <LineagePanel
                result={result}
                versions={orderedVersions}
                lineage={lineage}
                selected={selected}
                canSelect={canSelect}
                onToggle={toggleSelected}
                freshIds={freshIds}
                stored={stored}
              />
            </TabPanel>
          )}

          {canBreed && (tab === "directions" || tab === "lineage") && (
            <CrossBar
              result={result}
              lineage={lineage}
              selected={selected}
              onRemove={toggleSelected}
              onCross={cross}
              crossing={crossing}
              error={crossError}
            />
          )}
        </div>
      )}
    </div>
  );
}

// "Try another judge": re-runs only the judge on this result's directions and
// kept search results. Doesn't use up a run.
function RejudgeBox({ result, ownKey }: { result: Result; ownKey: boolean }) {
  const settings = useSettings();
  const models = useModels(ownKey);
  const selectId = useId();
  const [judge, setJudge] = useState(settings.judge);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ error: string; outOfJuice?: boolean } | null>(null);
  const toast = useToast();

  async function getVerdict() {
    setBusy(true);
    setError(null);
    const failed = await rejudge(result.id, judge);
    setBusy(false);
    if (failed) setError(failed);
    else toast("Brainy's Take is ready");
  }

  return (
    <div className="mt-4 border-t border-line pt-4">
      <label htmlFor={selectId} className="text-sm font-semibold text-slate-950">
        Try another judge
      </label>
      <p className="mt-0.5 text-xs text-slate-500">
        Re-runs only the verdict on these directions{result.searchResults ? " and search results" : ""}. It doesn&apos;t
        count as a run{ownKey ? "" : ", but uses 1 shared free request"}.
        {!result.searchResults && result.search && result.search.ran.length > 0 && " This older result didn't keep its search results, so the verdict won't cite them."}
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <JudgeSelect
          id={selectId}
          models={models}
          value={judge}
          onChange={(j) => {
            setJudge(j);
            updateSettings({ judge: j });
          }}
          ownKey={ownKey}
        />
        <button
          type="button"
          onClick={getVerdict}
          disabled={busy}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? "Judging…" : "Get verdict"}
        </button>
      </div>
      {busy && <p role="status" className="mt-2 text-xs text-slate-500">The judge is reading everything. This can take a minute or two.</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error.error}{" "}
          {error.outOfJuice && !ownKey && (
            <Link href="/settings#api-keys" className="font-semibold underline underline-offset-2">
              Add your own key <span aria-hidden>→</span>
            </Link>
          )}
        </p>
      )}
    </div>
  );
}

// The server key's free fuel is out for today (daily pool used up, or every
// model out of credits). The way forward is the visitor's own key.
function OutOfJuice() {
  return (
    <div role="status" className="mt-8 max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <p aria-hidden className="text-4xl">🪫</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">
        Brainy&apos;s free fuel is out for today
      </h2>
      <p className="mt-2 leading-relaxed text-slate-600">
        Everyone&apos;s free runs share one daily tank of model requests, and it&apos;s empty until midnight UTC. Add your own free OpenRouter key to keep
        going. It stays in this browser and your runs on it don&apos;t touch the free limit.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          href="/settings#api-keys"
          className="inline-flex items-center gap-1.5 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent shadow-card transition hover:bg-accent-dark"
        >
          Add your own free OpenRouter key <span aria-hidden>→</span>
        </Link>
        <Link
          href="/"
          className="inline-flex rounded-full border border-slate-950 bg-surface px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-card transition hover:bg-slate-50"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}

// While the browser loads saved results.
function ResultSkeleton() {
  return (
    <div aria-hidden className="space-y-4 pt-14">
      <div className="shimmer h-4 w-24 rounded-md" />
      <div className="shimmer h-8 w-2/3 rounded-lg" />
      <div className="shimmer mt-10 h-64 w-full rounded-3xl" />
    </div>
  );
}

function NotFound() {
  return (
    <div className="max-w-xl pt-20">
      <p className="text-sm font-semibold text-accent">Result not found</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-950">This dish isn&apos;t in your kitchen</h1>
      <p className="mt-4 leading-relaxed text-slate-600">
        Results are kept in the browser that made them (or on every device, with sync on in Settings), so a
        result link only opens where it&apos;s stored. It may also
        have been deleted from your history.
      </p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/ask" className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-dark">
          Cook a new idea
        </Link>
        <Link href="/history" className="rounded-full border border-slate-950 bg-surface px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-card">
          Open history
        </Link>
      </div>
    </div>
  );
}
