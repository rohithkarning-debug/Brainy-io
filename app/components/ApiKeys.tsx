"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/app/components/Toast";
import { KEY_HEADERS, KEY_PROVIDERS, isValidKey, maskKey, type KeyProvider } from "@/lib/key-format";
import { removeKey, setKey, useKeys } from "@/lib/keys";
import { BYOK_RUNS_PER_USER_PER_DAY, RUNS_PER_USER_PER_DAY } from "@/lib/limits";

// What each key is for, shown under its name.
const PURPOSE: Record<KeyProvider, string> = {
  openrouter: `Runs on your key don't use your ${RUNS_PER_USER_PER_DAY} free runs a day (fair-use cap: ${BYOK_RUNS_PER_USER_PER_DAY} a day). A free OpenRouter account works.`,
  tavily: "Used for the live web search instead of Brainy's. Optional.",
};

/** Settings → API keys: add, test and remove the visitor's own keys. */
export function ApiKeys() {
  return (
    <section
      id="api-keys"
      aria-labelledby="api-keys-title"
      className="scroll-mt-24 rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
    >
      <h2 id="api-keys-title" className="font-semibold tracking-tight text-slate-950">
        API keys
      </h2>
      <p className="mt-1 max-w-xl text-sm leading-relaxed text-slate-500">
        Optional. Keys are kept only in this browser and sent with each request over HTTPS. Brainy&apos;s server uses
        them for that request and never stores or logs them.
      </p>
      <div className="mt-5 divide-y divide-line">
        <KeyRow provider="openrouter" />
        <KeyRow provider="tavily" />
      </div>
    </section>
  );
}

function KeyRow({ provider }: { provider: KeyProvider }) {
  const keys = useKeys();
  const toast = useToast();
  const stored = keys[provider];
  const { label, getUrl, example } = KEY_PROVIDERS[provider];
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const inputId = `key-${provider}`;

  async function test(key: string) {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", [KEY_HEADERS[provider]]: key },
        body: JSON.stringify({ provider }),
      });
      const data = await res.json().catch(() => ({}));
      setStatus(data.ok ? { ok: true, text: "Key works." } : { ok: false, text: data.error ?? "Couldn't check the key." });
    } catch {
      setStatus({ ok: false, text: "Couldn't reach Brainy. Check your connection." });
    } finally {
      setTesting(false);
    }
  }

  function save() {
    const key = draft.trim();
    if (!isValidKey(provider, key)) {
      setStatus({ ok: false, text: `That doesn't look like a ${label} key. It should start with ${example.replace("…", "")}` });
      return;
    }
    setKey(provider, key);
    setDraft("");
    toast(`${label} key saved in this browser`);
    void test(key);
  }

  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <label htmlFor={inputId} className="text-sm font-semibold text-slate-900">
          {label} key
        </label>
        <a
          href={getUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Get ${provider === "openrouter" ? "an" : "a"} ${label} key (opens in a new tab)`}
          className="text-xs font-medium text-accent hover:underline"
        >
          Get a key <span aria-hidden>↗</span>
        </a>
      </div>
      <p className="-mt-2 text-xs leading-relaxed text-slate-500">{PURPOSE[provider]}</p>

      {stored ? (
        <div className="flex flex-wrap items-center gap-2">
          <output
            id={inputId}
            aria-label={`Saved ${label} key ending in ${stored.slice(-4)}`}
            className="rounded-lg bg-slate-100 px-3 py-2 font-mono text-sm text-slate-700"
          >
            {maskKey(stored)}
          </output>
          <SmallButton onClick={() => test(stored)} disabled={testing}>
            {testing ? "Testing…" : "Test key"}
          </SmallButton>
          <SmallButton
            onClick={() => {
              removeKey(provider);
              setStatus(null);
              toast(`${label} key removed`);
            }}
          >
            Remove key
          </SmallButton>
        </div>
      ) : (
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            id={inputId}
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={example}
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 py-2 font-mono text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-accent/60 focus:ring-4 focus:ring-accent/10"
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent transition hover:bg-accent-dark disabled:cursor-not-allowed disabled:opacity-40"
          >
            Save key
          </button>
        </form>
      )}

      {status && (
        <p role="status" className={`text-sm ${status.ok ? "text-emerald-700" : "text-rose-700"}`}>
          {status.ok && "✓ "}
          {status.text}
        </p>
      )}
    </div>
  );
}

function SmallButton({ onClick, disabled = false, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
