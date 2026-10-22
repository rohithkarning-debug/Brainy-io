import type { Metadata } from "next";
import { ResultScreen } from "@/app/components/ResultScreen";

export const metadata: Metadata = { title: "Result" };

// Results live in the visitor's browser, so this page just hands the id
// to the client component that looks it up.
export default async function ResultPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultScreen id={id} />;
}
