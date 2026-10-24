// /r/[slug]: a result its owner made public (Settings → sync on, then
// "Make public"). Read-only and viewable without signing in; nothing but the
// result itself is shown. Unknown or private slugs are a plain 404.

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { SharedResult } from "@/app/components/SharedResult";
import type { Result } from "@/lib/history";
import { publicResult } from "@/lib/server/sync";

export const dynamic = "force-dynamic";

// One database read per request, shared by the metadata and the page.
const load = cache(async (slug: string) => (await publicResult(slug)) as Result | null);

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const result = await load((await params).slug);
  if (!result) return { title: "Not found" };
  const description = result.take ? `Brainy's pick: ${result.take.pick.title}. ${result.take.pick.pitch}` : "A Brainy result.";
  return {
    title: clip(result.idea, 60),
    description: clip(description, 200),
    // Shared on purpose, but not something to put in search results.
    robots: { index: false },
  };
}

export default async function SharedResultPage({ params }: { params: Promise<{ slug: string }> }) {
  const result = await load((await params).slug);
  if (!result) notFound();
  return <SharedResult result={result} />;
}
