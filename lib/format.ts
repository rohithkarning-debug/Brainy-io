// Small text helpers shared by several components.

import { SOURCE_LABELS, type SearchSource } from "@/lib/purposes";

// "Web", "Web + GitHub" etc.
export function sourceList(sources: SearchSource[]) {
  return sources.map((s) => SOURCE_LABELS[s]).join(" + ");
}

// "https://www.example.com/x" -> "example.com"
export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
