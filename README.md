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

## Free-only mode: run size, models and judge

Runs on the server's `OPENROUTER_API_KEY` only ever use **free** OpenRouter models.

- **Run size** (Ask page → Advanced, remembered in Settings): Quick = 3 directions
  (~5 model calls), Standard = 6 (~8), Full = 9 (~12). The estimate is directions
  + baseline + search-query writer + judge (`estimateCalls` in `lib/run-plan.ts`);
  the baseline is on by default only for Full, and both it and live search can be
  toggled. Quick is the default without your own key, Full with one. Which
  directions a smaller run keeps is set per purpose in `lib/run-plan.ts`.
- **Models**: `lib/server/catalog.ts` fetches OpenRouter's models API, keeps
  free text models with at least 32k context, drops small (< 12B by id) and
  special-purpose ones (safety, code, nano...), and caches the list for an hour
  in Upstash. Users pick 1-4 generators (default Auto: 3 healthy free models);
  directions are spread round-robin across them, each with up to 2 healthy free
  fallbacks.
- **Health** (`lib/server/health.ts`): a 429, 5xx or timeout marks a model busy
  for 10 minutes, a 404 unavailable for an hour, in one Upstash hash. Pickers
  show the dots; Auto and every fallback chain skip flagged models.
- **Judge**: Auto walks healthy free judges (`JUDGE_MODEL` first if it's a free
  model in the list), or the user picks one. Generation must finish 115s into
  the run, so the judge always gets the remaining ~155s. If the verdict still
  fails, **Try another judge** (`POST /api/judge`) re-runs only the judge on the
  directions and the search results the browser kept with the result. It
  doesn't use up a run but has its own cap (10/day).
- **Own key**: users with their own OpenRouter key can also pick paid models,
  labelled with their price; defaults stay the free Auto picks.

## Bring your own key

Settings → API keys lets a visitor add their own OpenRouter key (and, optionally,
a Tavily key). Keys live only in that browser's localStorage (`lib/keys.ts`) and
travel per request in the `x-user-openrouter-key` / `x-user-tavily-key` headers.
`lib/server/guard.ts` format-checks them and the routes use them for that request
only: they are never stored, logged or echoed back. If a user's key is refused,
the run fails with "Your key was rejected" rather than quietly using the server key.

Runs on a visitor's own key skip the 5 free runs (an anti-abuse cap of 50/day
applies) and never touch the shared pool.

## The shared free pool

Every model call made on the server key counts against `GLOBAL_DAILY_CALLS`
(default 45), stored in Upstash per UTC day (`lib/server/quota.ts`). A request
reserves its estimated calls up front with one atomic Lua script, so concurrent
runs can't both take the last few; if fewer are left than the estimate, it's
refused with "Not enough free fuel left today for this run size". Fallbacks and
retries beyond the estimate take one more each while any are left; once the
pool is dry, further calls are refused and the run keeps its partial results.
Unused reservations are handed back at the end, so the count is real calls.
When OpenRouter answers with its daily free-model limit (`free-models-per-day`),
the pool is marked out until midnight UTC and visitors see "Brainy's free fuel
is out for today". The Ask page shows "Shared free requests left today: N".

## Idea breeding

On a finished result, select exactly two ideas (directions on the Directions tab,
or any node in the tree) and press **Cross**: one model call (`/api/cross`) breeds
3 offspring that fuse a trait from each parent, each with an "Inherits X from A,
Y from B" line. Offspring can be crossed again (generation 2, 3, ...), saved, and
judged per generation (`/api/judge-generation`). Each cross or judge counts as
one run (or one own-key run) and at least one call from the shared pool.

The tree lives in the stored result as `lineage` (`lib/lineage.ts`, `lib/breed.ts`),
so History and Saved reopen it; older results simply have none. The Lineage tab
draws it as plain SVG (`app/components/LineageTree.tsx`): left to right on wide
screens, top to bottom on narrow ones, with pan, pinch / Ctrl+scroll zoom and
ancestor lines lit on hover or focus.

## Prior work: Devpost and arXiv

- **Hackathon** runs also search past hackathon projects with Tavily limited to
  `devpost.com` project pages (Devpost has no public API; it is never scraped).
  The judge keeps the genuinely similar ones, rates each high / medium / low,
  and names "the twist none of them tried". The card says "We found N similar
  hackathon projects", or "No close matches found, which is a good sign".
- **Research** runs query the official arXiv API (`export.arxiv.org/api/query`):
  one request per search, at most one every 3 seconds across all instances
  (a Redis lock), with answers cached in Upstash for 24 hours. The judge keeps
  the 3-5 closest papers, says what each did and didn't do, and names the gap,
  flagging when it isn't sure.

In both, the judge refers to results by id and the server looks up every
title, link, author and year itself (`lib/openrouter.ts`), so a paper or
project can never be invented. If the judge's reply is malformed or times out,
it is retried once on the next model.

## Sign-in

Google and GitHub sign-in via Auth.js v5 (`auth.ts`), with JWT sessions, so no database.
Home, About and `/login` are public; `middleware.ts` sends signed-out visitors on
any other page to `/login?callbackUrl=...`, and `/api/expand` returns 401 on its own
check. Free runs are limited per user (5), with a looser per-IP backup (15), and
share the pool of model calls above. Each OAuth app needs these callback URLs:

- `http://localhost:3000/api/auth/callback/google` and `.../github`
- `https://brainy-io.vercel.app/api/auth/callback/google` and `.../github`

## How it fits together

- `app/api/expand/route.ts`: the main run. `POST` streams
  newline-delimited JSON events (`lib/stream.ts`) as each model finishes.
- `app/api/cross`, `app/api/judge-generation`: idea breeding; `app/api/judge`:
  "Try another judge"; `app/api/models`: the picker's model list with health;
  `app/api/keys/test` checks a visitor's own key. All model routes share
  `lib/server/guard.ts` (sign-in, keys, limits) and `lib/server/models.ts` (which
  models run).
- `lib/search.ts`: web, GitHub, Devpost (via Tavily) and arXiv searches.
- `lib/run.ts`: reads that stream in the browser and fills in a live result.
- `lib/history.ts`, `lib/settings.ts`: history, saved results and settings,
  all kept in the visitor's localStorage.
- `lib/reveal.ts`: "monochrome until it's cooked". The site is black and white;
  a finished result sets `<html data-cooked>`, which swaps the colour tokens in
  `app/globals.css` and fades in the gradient mesh and colour logo.
- `app/components/`: UI. Pages live in `app/<route>/page.tsx`.

## Scripts

`npm run dev` · `npm run build` · `npm run lint`
