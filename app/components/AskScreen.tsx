"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { IDEA_INPUT_ID } from "@/app/components/Nav";
import { PurposePicker } from "@/app/components/PurposePicker";
import { Kbd, Label } from "@/app/components/ui";
import { formatDate } from "@/lib/format";
import { useHistory } from "@/lib/history";
import { MAX_IDEA_LENGTH, RUNS_PER_USER_PER_DAY } from "@/lib/limits";
import { PURPOSES, type Purpose } from "@/lib/purposes";
import { refreshRemaining, startRun, useRemaining } from "@/lib/run";
import { useSettings } from "@/lib/settings";
import { LENGTHS, TONES } from "@/lib/style";

// Example ideas per purpose; a click drops one into the box.
const SUGGESTIONS: Record<Purpose, string[]> = {
  startup: [
    "An app that helps people swap houseplants",
    "A subscription for repairing clothes instead of replacing them",
    "Tools that help small restaurants cut food waste",
  ],
  hackathon: [
    "Turn any classroom whiteboard into live shared notes",
    "A game that teaches sign language through your webcam",
    "A real-time map of quiet study spots on campus",
  ],
  research: [
    "Does remote work change how people make friends?",
    "Can typing patterns on a phone detect fatigue?",
    "How well does AI translation handle local dialects?",
  ],
};

export function AskScreen({ initialIdea, initialPurpose }: { initialIdea: string; initialPurpose: Purpose }) {
  const router = useRouter();
  const [idea, setIdea] = useState(initialIdea);
  const [purpose, setPurpose] = useState<Purpose>(initialPurpose);
  const remaining = useRemaining();
  const history = useHistory();
  const settings = useSettings();
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Ask how many runs are left, and put the cursor in the box on desktop
  // (on phones that would pop the keyboard over the page).
  useEffect(() => {
    void refreshRemaining();
    if (matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
  }, []);

  const canSend = idea.trim() !== "" && remaining !== 0;

  function send() {
    if (!canSend) return;
    const { length, tone } = settings;
    const id = startRun({ idea: idea.trim(), purpose, length, tone });
    router.push(`/result/${id}`);
  }

  // Enter sends, Shift+Enter adds a new line.
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  }

  function pickSuggestion(text: string) {
    setIdea(text);
    inputRef.current?.focus();
  }

  const recent = history?.slice(0, 3) ?? [];

  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">Ask Brainy</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950 sm:text-5xl">What are we cooking?</h1>

      {/* Input card */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-8 max-w-3xl rounded-2xl border border-surface/70 bg-surface/85 p-4 shadow-lift backdrop-blur-xl sm:p-6"
      >
        <PurposePicker value={purpose} onChange={setPurpose} disabled={false} />

        <label htmlFor={IDEA_INPUT_ID} className="sr-only">
          Your idea
        </label>
        <textarea
          id={IDEA_INPUT_ID}
          ref={inputRef}
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="e.g. an app that helps people swap houseplants"
          rows={4}
          maxLength={MAX_IDEA_LENGTH}
          aria-describedby="idea-hint"
          className="mt-5 w-full resize-y rounded-xl border border-line bg-surface p-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
        />

        {/* Suggested prompts */}
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Suggested ideas">
          {SUGGESTIONS[purpose].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => pickSuggestion(s)}
              className="rounded-full border border-line bg-surface px-3 py-1.5 text-left text-xs text-slate-600 transition hover:border-accent/30 hover:text-slate-950"
            >
              {s}
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p id="idea-hint" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="tabular-nums">
              {idea.length}/{MAX_IDEA_LENGTH}
            </span>
            <span className="hidden sm:inline">
              <Kbd>Enter</Kbd> to send · <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> new line
            </span>
          </p>
          <div className="flex items-center gap-3">
            {typeof remaining === "number" && (
              <span className="text-xs tabular-nums text-slate-400">
                {remaining} of {RUNS_PER_USER_PER_DAY} free runs left today
              </span>
            )}
            <button
              type="submit"
              disabled={!canSend}
              className="group inline-flex items-center gap-1.5 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white shadow-[0_4px_14px_-4px] shadow-accent/60 transition hover:bg-accent-dark hover:shadow-[0_8px_24px_-6px] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-accent"
            >
              Expand idea
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </button>
          </div>
        </div>
      </form>

      {remaining === 0 && (
        <p className="mt-6 max-w-3xl rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
          You&apos;ve used your {RUNS_PER_USER_PER_DAY} free runs today, come back tomorrow! Your{" "}
          <Link href="/history" className="font-medium underline underline-offset-2">
            history
          </Link>{" "}
          is still here.
        </p>
      )}

      <p className="mt-4 max-w-3xl text-xs text-slate-400">
        Answers: {LENGTHS[settings.length].label.toLowerCase()}, {TONES[settings.tone].label.toLowerCase()} tone ·{" "}
        <Link href="/settings" className="underline underline-offset-2 hover:text-slate-600">
          change in Settings
        </Link>
      </p>

      {/* Recent results */}
      {recent.length > 0 && (
        <section className="mt-14 max-w-3xl">
          <div className="flex items-center justify-between">
            <Label>Recent</Label>
            <Link href="/history" className="text-xs font-medium text-accent hover:underline">
              All history →
            </Link>
          </div>
          <ul className="mt-3 space-y-2">
            {recent.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/result/${r.id}`}
                  className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface/80 px-4 py-3 shadow-card transition hover:border-accent/30"
                >
                  <span className="truncate text-sm text-slate-800">{r.idea}</span>
                  <span className="shrink-0 text-xs text-slate-400">
                    {PURPOSES[r.purpose].label} · {formatDate(r.createdAt)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
