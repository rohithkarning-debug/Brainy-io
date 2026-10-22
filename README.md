# Brainy

Turn a half-baked idea into genuinely different finished versions, check them
against what already exists, and get an honest verdict on which one to chase.

Next.js 15 (App Router) · React 19 · Tailwind v4 · OpenRouter · Tavily · Upstash Redis

## Run locally

```bash
cp .env.example .env.local   # then fill in the keys
npm install
npm run dev                  # http://localhost:3000
```

Only `OPENROUTER_API_KEY` is required locally. Leave the Upstash vars blank to
turn daily limits off. **Set them for any public deploy**, or limits are off there too.
Redis config is read from `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`,
falling back to `KV_REST_API_URL` / `KV_REST_API_TOKEN` (the names Vercel's
Upstash integration creates), so either pair works.

`JUDGE_MODEL` picks the model behind Brainy's Take (any OpenRouter model ID); it
defaults to a free one. If any model call gets HTTP 402 (out of credits), 429
(rate-limited) or 5xx, Brainy retries with the free models in `FREE_MODELS`
(`lib/openrouter.ts`). Free models have their own daily request caps on OpenRouter.

## How it fits together

- `app/api/expand/route.ts`: the only place API keys are used. `POST` streams
  newline-delimited JSON events (`lib/stream.ts`) as each model finishes.
- `lib/run.ts`: reads that stream in the browser and fills in a live result.
- `lib/history.ts`, `lib/settings.ts`: history, saved results and settings,
  all kept in the visitor's localStorage.
- `app/components/`: UI. Pages live in `app/<route>/page.tsx`.

## Scripts

`npm run dev` · `npm run build` · `npm run lint`
