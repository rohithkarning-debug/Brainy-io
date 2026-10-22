// Small text helpers shared by several components.

import type { Result } from "@/lib/history";
import type { BrainyTake, Version } from "@/lib/openrouter";
import { PURPOSES, SOURCE_LABELS, type Purpose, type SearchSource } from "@/lib/purposes";

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

// "Oct 22, 3:41 PM"
export function formatDate(ms: number) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(ms);
}

// Plain-text versions of answers, for copy and share.

export function versionToText(version: Version, purpose: Purpose) {
  const fields = PURPOSES[purpose].fields.map((f) => `${f.label}: ${version.details[f.key]}`).join("\n");
  return `${version.title} (${version.direction})\n${version.pitch}\n\n${fields}`;
}

export function takeToText(take: BrainyTake) {
  const lines = [
    `Brainy's pick: ${take.pick.title}`,
    take.pick.pitch,
    take.pick.why && `Why: ${take.pick.why}`,
    `Saturation: ${take.saturation}. ${take.saturationReason}`,
  ];
  if (take.similarExisting.length > 0) {
    lines.push("Similar things that exist:", ...take.similarExisting.map((s) => `- ${s.title}${s.url ? ` (${s.url})` : ""}`));
  }
  if (take.builtBefore) {
    const { found, projects, twist } = take.builtBefore;
    lines.push(
      found === 0
        ? "Built before: no close matches found on Devpost."
        : `Built before: we found ${found} similar hackathon project${found === 1 ? "" : "s"} on Devpost:`,
      ...projects.slice(0, 5).map((p) => `- ${p.title} (${p.closeness} match, ${p.url})`),
      twist && `The twist none of them tried: ${twist}`
    );
  }
  if (take.papers) {
    const { papers, gap } = take.papers;
    lines.push(
      ...(papers.length > 0 ? ["Closest papers:"] : []),
      ...papers.map((p) => `- ${p.title}${p.year ? ` (${p.year})` : ""}: ${p.url}`),
      gap && `The gap: ${gap}`
    );
  }
  return lines.filter(Boolean).join("\n");
}

export function resultToText(result: Result) {
  const parts = [`Idea (${PURPOSES[result.purpose].label}): ${result.idea}`];
  if (result.take) parts.push(takeToText(result.take));
  if (result.versions.length > 0) {
    parts.push("Directions:\n" + result.versions.map((v) => `- ${v.direction}: ${v.title}. ${v.pitch}`).join("\n"));
  }
  return parts.join("\n\n");
}
