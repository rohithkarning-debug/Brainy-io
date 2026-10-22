// The events POST /api/expand streams back, one JSON object per line.
// Each line is a complete piece of the result, so the page never has to
// parse half-finished JSON. Types only, safe to import from the page.

import type { BrainyTake, Version } from "@/lib/openrouter";
import type { SearchReport } from "@/lib/search";

export type StreamEvent =
  | { type: "start"; remaining: number | null } // run accepted; runs left today
  | { type: "search"; search: SearchReport } // live search finished
  | { type: "baseline"; version: Version }
  | { type: "version"; version: Version } // one direction finished (any order)
  | { type: "take"; take: BrainyTake | null } // null = the judge failed
  | { type: "error"; error: string } // fatal: nothing more is coming
  | { type: "done" };

export const STREAM_CONTENT_TYPE = "application/x-ndjson";
