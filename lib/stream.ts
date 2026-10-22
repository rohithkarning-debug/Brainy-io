// The events POST /api/expand streams back, one JSON object per line.
// Each line is a complete piece of the result, so the page never has to
// parse half-finished JSON. Types only, safe to import from the page.

import type { BrainyTake, Version } from "@/lib/openrouter";
import type { SearchReport } from "@/lib/search";

export type StreamEvent =
  | { type: "start"; remaining?: number | null } // run accepted; free runs left today (absent on an own-key run)
  | { type: "search"; search: SearchReport } // live search finished
  | { type: "baseline"; version: Version }
  | { type: "version"; version: Version } // one direction finished (any order)
  | { type: "take"; take: BrainyTake | null } // null = the judge failed
  // Fatal: nothing more is coming. outOfJuice = the server key's free fuel is out;
  // keyProblem = the visitor's own key was refused or is empty.
  | { type: "error"; error: string; outOfJuice?: boolean; keyProblem?: boolean }
  | { type: "done" };

export const STREAM_CONTENT_TYPE = "application/x-ndjson";
