import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/app/components/LegalPage";
import { RUNS_PER_USER_PER_DAY } from "@/lib/limits";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms"
      title="Terms of use"
      updated="24 October 2026"
      sections={[
        {
          heading: "The service",
          body: (
            <p>
              Brainy is a free side project that turns rough ideas into AI-generated concepts. It&apos;s offered as is,
              with no guarantee it will always be available or that results will be accurate.
            </p>
          ),
        },
        {
          heading: "Fair use",
          body: (
            <>
              <p>
                Each account gets {RUNS_PER_USER_PER_DAY} runs a day, and there are per-network and site-wide daily
                limits too. Please don&apos;t try to get around them, for example with many accounts or automated
                requests.
              </p>
              <p>Don&apos;t submit anything illegal, harmful, or that you don&apos;t have the right to share.</p>
            </>
          ),
        },
        {
          heading: "Results",
          body: (
            <p>
              Results are written by AI models and can be wrong, out of date or unoriginal. The verdict is an informed
              opinion, not professional, legal or financial advice. Check things yourself before relying on them.
              Your ideas, and what you do with the results, are yours. If you make a result public, anyone with the
              link can read it, so only share what you&apos;re happy for others to see; you can make it private again
              at any time.
            </p>
          ),
        },
        {
          heading: "Your data",
          body: (
            <p>
              See the <Link href="/privacy">privacy page</Link> for what is collected and where your ideas are sent.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Email <ContactLink />.
            </p>
          ),
        },
      ]}
    />
  );
}
