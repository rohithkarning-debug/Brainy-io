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
          heading: "Your own API keys",
          body: (
            <>
              <p>
                If you add your own OpenRouter or Tavily key in Settings, it is stored only in your browser&apos;s
                localStorage. It is sent to Brainy with each request over HTTPS, in a request header, and the server
                uses it for that request only, to call OpenRouter or Tavily on your behalf.
              </p>
              <p>
                Brainy never stores your key in its database, logs, analytics or error messages, and never shows more
                than its last 4 characters. If your key is rejected, Brainy tells you instead of quietly using its own
                key. Remove a key any time in Settings, and revoke it with the provider if you want it gone everywhere.
              </p>
            </>
          ),
        },
        {
          heading: "Usage limits",
          body: (
            <p>
              Each account gets {RUNS_PER_USER_PER_DAY} free runs a day, and runs on your own key have a separate fair-use cap. To enforce this, Brainy keeps daily run counters
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
