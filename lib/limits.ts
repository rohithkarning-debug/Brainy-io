// Shared limits. Plain constants only, so both the page (browser) and the
// API route (server) can import this file safely.

// Longest idea we accept, in characters.
export const MAX_IDEA_LENGTH = 1000;

// Runs each visitor (by IP) gets per day.
export const RUNS_PER_IP_PER_DAY = 5;

// Runs across ALL visitors per day: a safety net for API credits.
export const GLOBAL_RUNS_PER_DAY = 100;
