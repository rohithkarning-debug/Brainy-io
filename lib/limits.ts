// Shared limits. Plain constants only, so both the page (browser) and the
// API route (server) can import this file safely.

// Longest idea we accept, in characters.
export const MAX_IDEA_LENGTH = 1000;

// Runs each signed-in user gets per day.
export const RUNS_PER_USER_PER_DAY = 5;

// Runs per IP per day, across every account using it: a backup that stops one
// person cycling through accounts, loose enough for a shared office or dorm.
export const RUNS_PER_IP_PER_DAY = 15;

// Runs per day on a visitor's OWN OpenRouter key: they pay, so this is only
// an anti-abuse cap. These don't touch the free runs above.
export const BYOK_RUNS_PER_USER_PER_DAY = 50;

// Runs across ALL visitors per day on the server's key, unless the
// GLOBAL_DAILY_RUNS env var says otherwise (read in lib/ratelimit.ts).
export const DEFAULT_GLOBAL_DAILY_RUNS = 60;
