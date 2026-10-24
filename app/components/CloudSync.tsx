"use client";

import { useSession } from "next-auth/react";
import { useEffect } from "react";
import { flush, pull, startSync } from "@/lib/sync";

/**
 * Runs cloud sync for the signed-in account (see lib/sync.ts): checks once
 * whether it's on, pulls other devices' changes when the tab comes back, and
 * sends anything queued when the tab is hidden. Does nothing while signed out.
 */
export function CloudSync() {
  const { data, status } = useSession();
  const userId = status === "authenticated" ? (data?.user?.id ?? null) : null;

  useEffect(() => {
    if (status === "loading") return;
    startSync(userId);
    if (!userId) return;
    let last = Date.now();
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        void flush();
      } else if (Date.now() - last > 20_000) {
        last = Date.now();
        void pull();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [userId, status]);

  return null;
}
