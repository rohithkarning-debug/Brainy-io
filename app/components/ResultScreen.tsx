"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import { BrainyTakeCard } from "@/app/components/BrainyTakeCard";
import { CookingLoader, SkeletonCard } from "@/app/components/CookingLoader";
import { useCopyShare } from "@/app/components/CopyShare";
import { useToast } from "@/app/components/Toast";
import { ActionButton, SectionTitle, TabPanel, Tabs } from "@/app/components/ui";
import { VersionCard } from "@/app/components/VersionCard";
import { formatDate, resultToText, sourceList } from "@/lib/format";
import { togglePin, useHistory, type Result } from "@/lib/history";
import { PURPOSES } from "@/lib/purposes";
import { startRun, stopRun, useRun } from "@/lib/run";
import { setCooked } from "@/lib/reveal";
import { useMotionAllowed, useSettings } from "@/lib/settings";
import { LENGTHS, TONES } from "@/lib/style";

type Tab = "verdict" | "directions" | "baseline";

/** /result/[id]: a run still cooking in this tab, or a result from history. */
export function ResultScreen({ id }: { id: string }) {
  const live = useRun(id);
  const history = useHistory();
  const saved = history?.find((r) => r.id === id) ?? null;
  const result = live ?? saved;

  if (!result) return history === null ? <ResultSkeleton /> : <NotFound />;
  // key: a fresh view (tabs, toggles) for every result
  return <ResultView key={id} result={result} live={live !== null} pinned={saved?.pinned ?? false} stored={saved !== null} />;
}

/**
 * One result with its tabs. `example` is the static sample on the home page:
 * no page actions, and the page around it handles the colour reveal.
 */
export function ResultView({
  result,
  live = false,
  pinned = false,
  stored = false,
  example = false,
}: {
  result: Result;
  live?: boolean;
  pinned?: boolean;
  stored?: boolean;
  example?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { copy, share } = useCopyShare();
  const settings = useSettings();
  const [tab, setTab] = useState<Tab>("verdict");
  const [detailsOpen, setDetailsOpen] = useState(true);

  const { purpose } = result;
  const cooking = result.status === "cooking";
  const directions = PURPOSES[purpose].directions;
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

  // The direction the judge built its pick on gets highlighted after the reveal.
  const pickedDirection = result.take?.pick.basedOn.trim().toLowerCase();

  // Same idea and purpose, with the current answer settings.
  function regenerate() {
    const id = startRun({ idea: result.idea, purpose, length: settings.length, tone: settings.tone });
    router.push(`/result/${id}`);
  }

  function pin() {
    toast(togglePin(result.id) ? "Saved to favorites" : "Removed from saved");
  }

  // The honest status line under the cooking animation.
  const arrived = result.versions.length + (result.baseline ? 1 : 0);
  const total = directions.length + 1;
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
  ];

  const Heading = example ? "h3" : "h1";

  return (
    // Frosted panel once cooked, so text stays readable over the colour.
    // The padding is always there, so nothing shifts when it appears.
    <div className="-mx-4 mt-6 rounded-[2rem] border border-transparent p-4 transition-colors duration-1000 sm:-mx-8 sm:mt-10 sm:p-8 cooked:border-line cooked:bg-surface/80 cooked:shadow-hero cooked:backdrop-blur-xl">
      {/* ---------- Header: the idea and page actions ---------- */}
      {!example && (
        <Link href="/ask" className="mb-5 inline-block text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <span aria-hidden>←</span> New idea
        </Link>
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
        {example ? null : cooking ? (
          <ActionButton icon="stop" variant="danger" onClick={() => stopRun(result.id)}>
            Stop generating
          </ActionButton>
        ) : (
          !result.limited && !result.outOfJuice && (
            <ActionButton icon="refresh" onClick={regenerate}>
              Regenerate
            </ActionButton>
          )
        )}
        {hasContent && !example && (
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
        {finished && motion && (
          <ActionButton icon="sparkle" onClick={replayReveal}>
            Replay reveal
          </ActionButton>
        )}
      </div>

      {/* ---------- Notes: limit, out of juice, error, stopped ---------- */}
      {result.limited ? (
        <p className="mt-8 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">{result.error}</p>
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
              <BrainyTakeCard
                take={result.take}
                search={result.search ?? { ran: [], skipped: [] }}
                purpose={purpose}
                live={live}
              />
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
              <p className="rounded-xl border border-line bg-surface p-4 text-sm text-slate-500 shadow-card">
                {result.status === "done"
                  ? "Brainy's Take couldn't be generated this time, but the directions are ready."
                  : "The run ended before the judge could weigh in, but the directions that arrived are ready."}
              </p>
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
                  return (
                    <VersionCard
                      key={d.label}
                      version={version}
                      purpose={purpose}
                      live={live}
                      detailsOpen={detailsOpen}
                      colorIndex={i}
                      picked={d.label.toLowerCase() === pickedDirection}
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
              ) : cooking ? (
                <SkeletonCard label="Baseline" />
              ) : (
                <p className="text-sm text-slate-500">The baseline didn&apos;t come through this time.</p>
              )}
            </div>
          </TabPanel>
        </div>
      )}
    </div>
  );
}

// Every model was out of credits or rate-limited: nothing to retry until tomorrow.
function OutOfJuice() {
  return (
    <div role="status" className="mt-8 max-w-3xl rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
      <p aria-hidden className="text-4xl">🪫</p>
      <h2 className="mt-3 text-2xl font-semibold tracking-[-0.03em] text-slate-950">Brainy&apos;s out of juice for today</h2>
      <p className="mt-2 leading-relaxed text-slate-600">
        The AI models behind Brainy have used up today&apos;s allowance. Try again tomorrow, your idea will still be
        half-baked and waiting.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex rounded-full border border-slate-950 bg-surface px-5 py-2.5 text-sm font-semibold text-slate-950 shadow-card transition hover:bg-slate-50"
      >
        Back home
      </Link>
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
        Results are kept in the browser that made them, so a result link only opens on that device. It may also
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
