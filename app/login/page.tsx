import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { LogoMark } from "@/app/components/Logo";
import { RUNS_PER_USER_PER_DAY } from "@/lib/limits";

export const metadata: Metadata = { title: "Sign in" };

// Where to go after signing in. Middleware passes a full URL, links pass a path;
// either way only the path is kept, so the link can't bounce visitors to
// another website ("//evil.com" would be read as a different host).
function safeCallback(value: string | string[] | undefined) {
  if (typeof value !== "string") return "/ask";
  try {
    const url = new URL(value, "http://brainy.local");
    const path = "/" + url.pathname.replace(/^[/\\]+/, "");
    return path === "/login" ? "/ask" : path + url.search;
  } catch {
    return "/ask";
  }
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[]; error?: string | string[] }>;
}) {
  const params = await searchParams;
  const callbackUrl = safeCallback(params.callbackUrl);

  // Already signed in: go straight on.
  const session = await auth();
  if (session?.user) redirect(callbackUrl);

  async function withGoogle() {
    "use server";
    await signIn("google", { redirectTo: callbackUrl });
  }
  async function withGitHub() {
    "use server";
    await signIn("github", { redirectTo: callbackUrl });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center pt-16 text-center sm:pt-24">
      <LogoMark size={48} className="text-slate-950" />
      <h1 className="mt-6 text-3xl font-semibold tracking-[-0.04em] text-slate-950">Sign in to Brainy</h1>
      <p className="mt-3 text-slate-600">
        Signing in keeps runs fair: everyone gets {RUNS_PER_USER_PER_DAY} free runs a day.
      </p>

      {params.error && (
        <p role="alert" className="mt-6 w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Sign-in didn&apos;t work. Please try again.
        </p>
      )}

      <div className="mt-8 flex w-full flex-col gap-3">
        <form action={withGoogle}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-full border border-slate-950 bg-surface px-5 py-3 text-sm font-semibold text-slate-950 shadow-card transition hover:bg-slate-50"
          >
            <GoogleIcon />
            Continue with Google
          </button>
        </form>
        <form action={withGitHub}>
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-3 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-50 shadow-card transition hover:bg-slate-800"
          >
            <GitHubIcon />
            Continue with GitHub
          </button>
        </form>
      </div>

      <p className="mt-6 text-xs leading-relaxed text-slate-400">
        We only read your name, email and avatar. Your history stays in this browser unless you turn on sync.
        Ideas are sent to AI and search providers only to generate results.
      </p>
      <p className="mt-3 text-xs text-slate-400">
        <Link href="/privacy" className="underline underline-offset-2 hover:text-slate-600">
          Privacy
        </Link>{" "}
        ·{" "}
        <Link href="/terms" className="underline underline-offset-2 hover:text-slate-600">
          Terms
        </Link>
      </p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.4-4-1.4-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.4 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.8.1 3.2.8.8 1.2 1.9 1.2 3.1 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.2v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}
