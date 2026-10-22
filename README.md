# Brainy

Turn a half-baked idea into genuinely different finished versions, check them
against what already exists, and get an honest verdict on which one to chase.

Next.js 15 (App Router) · React 19 · Tailwind v4 · Auth.js · OpenRouter · Tavily · Upstash Redis

## Run locally

```bash
cp .env.example .env.local   # then fill in the keys
npm install
npm run dev                  # http://localhost:3000
```

`OPENROUTER_API_KEY` and the `AUTH_*` sign-in vars are required. Leave the Upstash vars blank to
turn daily limits off. **Set them for any public deploy**, or limits are off there too.
Redis config is read from `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`,
falling back to `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the names Vercel's
Upstash integration creates), so either pair works.

`JUDGE_MODEL` picks the model behind Brainy's Take (any OpenRouter model ID); it
defaults to a free one. If any model call gets HTTP 402 (out of credits), 429
(rate-limited) or 5xx, Brainy retries with the free models in `FREE_MODELS`
(`lib/openrouter.ts`). Free models have their own daily request caps on OpenRouter.

## Bring your own key

Settings → API keys lets a visitor add their own OpenRouter key (and, optionally,
a Tavily key). Keys live only in that browser's localStorage (`lib/keys.ts`) and
travel per request in the `x-user-openrouter-key` / `x-user-tavily-key` headers.
`lib/server/guard.ts` format-checks them and the routes use them for that request
only: they are never stored, logged or echoed back. If a user's key is refused,
the run fails with "Your key was rejected" rather than quietly using the server key.

Runs on a visitor's own key skip the 5 free runs (an anti-abuse cap of 50/day
applies). Free runs on the server key share a global daily pool,
`GLOBAL_DAILY_RUNS` (default 60). When it's used up, or every model on the server
key returns 402/429, visitors see "Brainy's free fuel is out for today" with a
link to add their own key.

## Sign-in

Google and GitHub sign-in via Auth.js v5 (`auth.ts`), with JWT sessions, so no database.
Home, About and `/login` are public; `middleware.ts` sends signed-out visitors on
any other page to `/login?callbackUrl=...`, and `/api/expand` returns 401 on its own
check. Free runs are limited per user (5), with a looser per-IP backup (15) and a
global pool (`GLOBAL_DAILY_RUNS`, default 60). Each OAuth app needs these callback URLs:

- `http://localhost:3000/api/auth/callback/google` and `.../github`
- `https://brainy-io.vercel.app/api/auth/callback/google` and `.../github`

## How it fits together

- `app/api/expand/route.ts`: the only place API keys are used. `POST` streams
  newline-delimited JSON events (`lib/stream.ts`) as each model finishes.
- `lib/run.ts`: reads that stream in the browser and fills in a live result.
- `lib/history.ts`, `lib/settings.ts`: history, saved results and settings,
  all kept in the visitor's localStorage.
- `lib/reveal.ts`: "monochrome until it's cooked". The site is black and white;
  a finished result sets `<html data-cooked>`, which swaps the colour tokens in
  `app/globals.css` and fades in the gradient mesh and colour logo.
- `app/components/`: UI. Pages live in `app/<route>/page.tsx`.

## Scripts

`npm run dev` · `npm run build` · `npm run lint`
