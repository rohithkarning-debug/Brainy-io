// "Bring your own key": header names, format checks and masking. Plain code
// only, so both the page (browser) and the API routes (server) can import it.

export type KeyProvider = "openrouter" | "tavily";

// Keys travel per request in these headers (over HTTPS), never in a body or URL.
export const KEY_HEADERS: Record<KeyProvider, string> = {
  openrouter: "x-user-openrouter-key",
  tavily: "x-user-tavily-key",
};

// Loose on purpose: the prefix and a sane length, so a typo or a pasted
// sentence is caught but a provider tweaking its format isn't.
const FORMATS: Record<KeyProvider, RegExp> = {
  openrouter: /^sk-or-[A-Za-z0-9_-]{20,200}$/,
  tavily: /^tvly-[A-Za-z0-9_-]{16,200}$/,
};

export function isValidKey(provider: KeyProvider, key: string): boolean {
  return FORMATS[provider].test(key);
}

// "sk-or-v1-…" -> "••••abcd": only the last 4 characters are ever shown.
export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

export const KEY_PROVIDERS: Record<KeyProvider, { label: string; getUrl: string; example: string }> = {
  openrouter: { label: "OpenRouter", getUrl: "https://openrouter.ai/keys", example: "sk-or-v1-…" },
  tavily: { label: "Tavily", getUrl: "https://app.tavily.com", example: "tvly-…" },
};
