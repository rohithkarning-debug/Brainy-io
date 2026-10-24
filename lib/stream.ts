// The events POST /api/expand streams back, one JSON object per line.
// Each line is a complete piece of the result, so the page never has to
// parse half-finished JSON. Types only, safe to import from the page.

import type { BrainyTake, Version } from "@/lib/openrouter";
import type { RunSize } from "@/lib/run-plan";
import type { SearchReport, SearchResult } from "@/lib/search";

/** What a run actually does, as the server settled it (stored on the result). */
export type RunPlanInfo = {
  size: RunSize;
  directions: string[]; // direction labels, in their usual order
  baseline: boolean;
  search: boolean;
  generators: string[]; // the models the directions were spread across
};

export type StreamEvent =
  // Run accepted. remaining = free runs left today, sharedLeft = shared free
  // calls left after this run's reservation (both absent on an own-key run).
  | { type: "start"; plan: RunPlanInfo; remaining?: number | null; sharedLeft?: number | null }
  // Live search finished. `results` are kept so the judge can be re-run later.
  | { type: "search"; search: SearchReport; results: SearchResult[] }
  | { type: "baseline"; version: Version }
  | { type: "version"; version: Version } // one direction finished (any order)
  | { type: "take"; take: BrainyTake | null } // null = the judge failed
  // Fatal: nothing more is coming. outOfJuice = the server key's free fuel is out;
  // keyProblem = the visitor's own key was refused or is empty.
  | { type: "error"; error: string; outOfJuice?: boolean; keyProblem?: boolean }
  // fuelOut = the shared pool ran dry during this run (results may be partial).
  | { type: "done"; sharedLeft?: number | null; fuelOut?: boolean };

export const STREAM_CONTENT_TYPE = "application/x-ndjson";
