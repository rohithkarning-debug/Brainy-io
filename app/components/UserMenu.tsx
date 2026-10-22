"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

// Right side of the nav: "Sign in" when signed out, an avatar menu when signed in.
export function UserMenu() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on a click outside or Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Hold the space while the session loads, so the nav doesn't jump.
  if (status === "loading") return <span className="h-9 w-9" aria-hidden />;

  if (!session?.user) {
    const callbackUrl = pathname === "/login" || pathname === "/" ? "/ask" : pathname;
    return (
      <Link
        href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-50 transition hover:bg-slate-800"
      >
        Sign in
      </Link>
    );
  }

  const { name, email, image } = session.user;
  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-line bg-surface text-sm font-semibold text-slate-700 shadow-card"
      >
        {image ? (
          // Provider avatars come from many hosts; a plain img avoids listing them all.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" width={36} height={36} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
        ) : (
          (name ?? email ?? "?").charAt(0).toUpperCase()
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="animate-page-in absolute right-0 top-full z-50 mt-2 w-60 rounded-2xl border border-line bg-surface p-1.5 shadow-lift"
        >
          <div className="px-3 py-2">
            {name && <p className="truncate text-sm font-semibold text-slate-950">{name}</p>}
            {email && <p className="truncate text-xs text-slate-500">{email}</p>}
          </div>
          <div className="my-1 h-px bg-line" />
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => signOut({ redirectTo: "/" })}
            className="block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-950"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
