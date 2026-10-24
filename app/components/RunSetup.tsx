"use client";

import { useId } from "react";
import { GeneratorPicker, JudgeSelect } from "@/app/components/ModelPicker";
import { Disclosure, Segmented, Switch } from "@/app/components/ui";
import { useModels } from "@/lib/models";
import { RUN_SIZES, RUN_SIZE_KEYS, estimateCalls, type RunOptions } from "@/lib/run-plan";
import { updateSettings } from "@/lib/settings";

/**
 * The Ask page's "Advanced" panel: run size, baseline and search toggles,
 * generator models and the judge. Every change is saved to Settings.
 */
export function RunSetup({ run, ownKey }: { run: RunOptions; ownKey: boolean }) {
  const models = useModels(ownKey);
  const judgeId = useId();
  const summary = `${RUN_SIZES[run.size].label} · ${run.models.length === 0 ? "Auto models" : `${run.models.length} model${run.models.length === 1 ? "" : "s"}`} · ${
    run.judge === "auto" ? "Auto judge" : "chosen judge"
  }`;

  return (
    <div className="mt-5 rounded-xl border border-line px-4 py-3">
      <Disclosure
        defaultOpen={false}
        summary={
          <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-semibold text-slate-950">Advanced</span>
            <span className="text-xs text-slate-500">{summary}</span>
          </span>
        }
      >
        <div className="space-y-6 pb-2 pt-4">
          <div>
            <p className="text-sm font-semibold text-slate-950">Run size</p>
            <p className="mt-0.5 text-xs text-slate-500">
              More directions means more ideas, and more model requests.
            </p>
            <div className="mt-2">
              <Segmented
                name="ask-run-size"
                legend="Run size"
                choices={RUN_SIZE_KEYS.map((k) => ({
                  value: k,
                  label: `${RUN_SIZES[k].label} · ${RUN_SIZES[k].directions}`,
                  hint: `${RUN_SIZES[k].hint}, ~${estimateCalls({ ...run, size: k, baseline: k === "full" })} requests`,
                }))}
                value={run.size}
                onChange={(v) => updateSettings({ runSize: v, baseline: null })}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <ToggleRow
              label="Include baseline"
              hint="A plain “typical AI” answer to compare against. 1 request."
              checked={run.baseline}
              onChange={(v) => updateSettings({ baseline: v })}
            />
            <ToggleRow
              label="Live search"
              hint="Checks what already exists. Search itself is free; writing the queries is 1 request."
              checked={run.search}
              onChange={(v) => updateSettings({ liveSearch: v })}
            />
          </div>

          <GeneratorPicker models={models} value={run.models} onChange={(m) => updateSettings({ models: m })} ownKey={ownKey} />

          <div>
            <label htmlFor={judgeId} className="text-sm font-semibold text-slate-950">
              Judge
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Writes Brainy&apos;s Take. Auto tries the best healthy free judge, then the next.
            </p>
            <JudgeSelect
              id={judgeId}
              models={models}
              value={run.judge}
              onChange={(j) => updateSettings({ judge: j })}
              ownKey={ownKey}
              className="mt-2"
            />
          </div>
        </div>
      </Disclosure>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line px-3 py-2.5">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{hint}</p>
      </div>
      <Switch size="sm" label={label} checked={checked} onChange={onChange} />
    </div>
  );
}
