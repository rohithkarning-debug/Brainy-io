import type { Metadata } from "next";
import { ContactLink, LegalPage } from "@/app/components/LegalPage";
import { RUNS_PER_USER_PER_DAY } from "@/lib/limits";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="What Brainy does with your data"
      updated="22 October 2026"
      sections={[
        {
          heading: "Signing in",
          body: (
            <p>
              You sign in with Google or GitHub. From them Brainy reads only your name, email address and avatar. There
              is no Brainy database of accounts: your session lives in a signed cookie in your browser.
            </p>
          ),
        },
        {
          heading: "Your ideas",
          body: (
            <>
              <p>When you cook an idea, it is sent to outside services only to generate the result:</p>
              <ul>
                <li>
                  <a href="https://openrouter.ai/privacy" target="_blank" rel="noreferrer">
                    OpenRouter
                  </a>
                  , which passes it to the AI models that write the versions and the verdict.
                </li>
                <li>
                  <a href="https://tavily.com/privacy" target="_blank" rel="noreferrer">
                    Tavily
                  </a>
                  , which runs the web search for similar work. Short search phrases based on your idea may also be sent
                  to GitHub and arXiv search.
                </li>
              </ul>
              <p>Brainy itself doesn&apos;t keep your ideas or results on its servers.</p>
            </>
          ),
        },
        {
          heading: "Your history",
          body: (
            <p>
              History, saved results and settings are stored in your browser&apos;s localStorage, on your device only.
              Clearing your browser data, or &quot;Clear history&quot; in Brainy, removes them.
            </p>
          ),
        },
        {
          heading: "Usage limits",
          body: (
            <p>
              Each account gets {RUNS_PER_USER_PER_DAY} runs a day. To enforce this, Brainy keeps daily run counters
              keyed on your account id and IP address. They reset every day and hold nothing else.
            </p>
          ),
        },
        {
          heading: "Contact",
          body: (
            <p>
              Questions, or want something removed? Email <ContactLink />.
            </p>
          ),
        },
      ]}
    />
  );
}
