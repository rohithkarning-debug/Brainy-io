"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/app/components/ui";

type Tone = "success" | "error";
type Toast = { id: number; message: string; tone: Tone };

const ToastContext = createContext<(message: string, tone?: Tone) => void>(() => {});

/** Show a short message at the bottom of the screen, e.g. toast("Copied"). */
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const toast = useCallback((message: string, tone: Tone = "success") => {
    const id = ++nextId.current;
    // Keep at most three on screen.
    setToasts((list) => [...list.slice(-2), { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 2600);
  }, []);

  return (
    <ToastContext value={toast}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="animate-rise-in inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-50 shadow-lift"
          >
            <Icon name={t.tone === "success" ? "check" : "close"} className={`h-4 w-4 ${t.tone === "success" ? "text-emerald-400" : "text-rose-400"}`} />
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext>
  );
}
