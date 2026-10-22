import type { Metadata } from "next";
import { AskScreen } from "@/app/components/AskScreen";
import { MAX_IDEA_LENGTH } from "@/lib/limits";
import { isPurpose } from "@/lib/purposes";

export const metadata: Metadata = { title: "Ask" };

// /ask?idea=...&purpose=... pre-fills the form (used by follow-up suggestions).
export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ idea?: string | string[]; purpose?: string | string[] }>;
}) {
  const params = await searchParams;
  const idea = typeof params.idea === "string" ? params.idea.slice(0, MAX_IDEA_LENGTH) : "";
  const purpose = isPurpose(params.purpose) ? params.purpose : "startup";
  // The key resets the form when a different follow-up is opened.
  return <AskScreen key={`${purpose}:${idea}`} initialIdea={idea} initialPurpose={purpose} />;
}
