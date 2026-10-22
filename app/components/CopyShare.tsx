"use client";

import { useToast } from "@/app/components/Toast";
import { IconButton } from "@/app/components/ui";

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Copy and share actions with toasts. Share uses the system sheet when there is one. */
export function useCopyShare() {
  const toast = useToast();

  async function copy(text: string, what = "Copied to clipboard") {
    if (await copyText(text)) toast(what);
    else toast("Couldn't copy, your browser blocked it", "error");
  }

  // Shares the text plus a link to the current page.
  async function share(title: string, text: string) {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return; // closed the sheet
      }
    }
    await copy(`${text}\n\n${url}`, "Copied with a link to this page");
  }

  return { copy, share };
}

/** The copy + share icon pair shown on each answer card. */
export function CopyShareButtons({ title, text }: { title: string; text: string }) {
  const { copy, share } = useCopyShare();
  return (
    <div className="flex items-center">
      <IconButton icon="copy" label="Copy" onClick={() => copy(text)} />
      <IconButton icon="share" label="Share" onClick={() => share(title, text)} />
    </div>
  );
}
