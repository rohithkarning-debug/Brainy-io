"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/app/components/ui";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/ask", label: "Ask" },
  { href: "/history", label: "History" },
  { href: "/saved", label: "Saved" },
  { href: "/settings", label: "Settings" },
  { href: "/about", label: "About" },
];

// The idea box on /ask has this id, so Ctrl/Cmd+K can focus it.
export const IDEA_INPUT_ID = "idea-input";

function isActive(pathname: string, href: string) {
  // Result pages belong to the Ask flow.
  if (href === "/ask") return pathname === "/ask" || pathname.startsWith("/result/");
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

// Top bar: the gradient mark plus the name, page links, and a hamburger menu on small screens.
export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);

  // Close the mobile menu whenever the page changes.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  // Ctrl/Cmd+K: focus the idea box, opening the Ask page first if needed.
  // Escape closes the mobile menu.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const input = document.getElementById(IDEA_INPUT_ID);
        if (input) input.focus();
        else router.push("/ask");
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router]);

  return (
    <header className="sticky top-0 z-40 border-b border-line/0 bg-canvas/60 backdrop-blur-lg supports-[backdrop-filter]:bg-canvas/40">
      <nav aria-label="Main" className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent via-fuchsia-500 to-orange-400 text-sm font-bold text-white shadow-card">
            b
          </span>
          <span className="text-lg font-semibold tracking-tight text-slate-950">brainy</span>
        </Link>

        {/* Desktop links */}
        <ul className="hidden items-center gap-1 rounded-full border border-surface/70 bg-surface/60 p-1 shadow-card backdrop-blur md:flex">
          {LINKS.map((link) => (
            <li key={link.href}>
              <NavLink {...link} active={isActive(pathname, link.href)} />
            </li>
          ))}
        </ul>

        {/* Mobile menu button */}
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((o) => !o)}
          className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface/80 text-slate-700 shadow-card md:hidden"
        >
          <Icon name={open ? "close" : "menu"} className="h-5 w-5" />
        </button>
      </nav>

      {/* Mobile menu panel */}
      {open && (
        <div id="mobile-menu" className="animate-page-in border-t border-line bg-surface/95 px-4 pb-4 pt-2 shadow-lift backdrop-blur md:hidden">
          <ul className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <NavLink {...link} active={isActive(pathname, link.href)} block />
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  );
}

function NavLink({ href, label, active, block = false }: { href: string; label: string; active: boolean; block?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${block ? "block px-4 py-3 text-base" : "px-3.5 py-1.5 text-sm"} rounded-full font-medium transition-colors ${
        active ? "bg-slate-900 text-slate-50 shadow-card" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
      }`}
    >
      {label}
    </Link>
  );
}
