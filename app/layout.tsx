import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { SessionProvider } from "next-auth/react";
import { MeshGradient } from "@/app/components/MeshGradient";
import { Nav } from "@/app/components/Nav";
import { SettingsSync } from "@/app/components/SettingsSync";
import { ToastProvider } from "@/app/components/Toast";
import "./globals.css";

// Crisp sans-serif for everything; headings use it with tight tracking.
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Makes the generated social image URL absolute.
  metadataBase: new URL("https://brainy-io.vercel.app"),
  title: { default: "Brainy", template: "%s · Brainy" },
  description: "Turn a half-baked idea into genuinely different finished versions.",
};

// Runs before the page paints so the saved theme, font size and motion
// setting apply without a flash. Reads the same key as lib/settings.ts.
const PREFERENCES_SCRIPT = `(function(){try{
var s=JSON.parse(localStorage.getItem("brainy:settings")||"{}"),d=document.documentElement,dark=s.theme==="dark";
d.classList.toggle("dark",dark);d.style.colorScheme=dark?"dark":"light";
d.dataset.font=s.fontSize||"md";d.dataset.motion=s.animations===false?"off":"on";
}catch(e){}})()`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // The head script changes <html> attributes before React loads.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFERENCES_SCRIPT }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SessionProvider>
          <ToastProvider>
            <SettingsSync />
            {/* overflow-x-clip (not hidden) keeps the blobs in without breaking the sticky nav */}
            <div className="relative isolate flex min-h-screen flex-col overflow-x-clip">
              <MeshGradient />
              <a
                href="#main"
                className="sr-only z-50 rounded-full bg-surface px-4 py-2 text-sm font-medium shadow-lift focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
              >
                Skip to content
              </a>
              <Nav />
              <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-6">
                {children}
              </main>
              <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 pb-8 text-xs text-slate-400 sm:px-6">
                <p>
                  brainy · 3 models · live search · 1 honest judge ·{" "}
                  <Link href="/about" className="underline-offset-2 hover:text-slate-600 hover:underline">
                    how it works
                  </Link>
                </p>
                <nav aria-label="Footer" className="flex gap-4">
                  <Link href="/privacy" className="underline-offset-2 hover:text-slate-600 hover:underline">
                    Privacy
                  </Link>
                  <Link href="/terms" className="underline-offset-2 hover:text-slate-600 hover:underline">
                    Terms
                  </Link>
                  <a
                    href="https://github.com/rohithkarning-debug"
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:text-slate-600 hover:underline"
                  >
                    GitHub
                  </a>
                </nav>
              </footer>
            </div>
          </ToastProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
