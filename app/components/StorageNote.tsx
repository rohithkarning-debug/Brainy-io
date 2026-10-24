"use client";

import Link from "next/link";
import { useSync } from "@/lib/sync";

/** Where history lives right now: this browser only, or synced to the account. */
export function StorageNote() {
  const { enabled } = useSync();
  return (
    <p className="mt-3 max-w-xl text-slate-600">
      {enabled ? (
        <>
          Synced to your account, so it&apos;s the same on every device you sign in on.{" "}
          <Link href="/settings#sync" className="underline underline-offset-2">
            Sync settings
          </Link>
        </>
      ) : (
        <>
          Kept in this browser only.{" "}
          <Link href="/settings#sync" className="underline underline-offset-2">
            Turn on sync
          </Link>{" "}
          to see it on your other devices.
        </>
      )}
    </p>
  );
}
