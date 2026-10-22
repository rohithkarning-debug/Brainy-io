import type { Metadata } from "next";
import { SettingsScreen } from "@/app/components/SettingsScreen";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="pt-10 sm:pt-16">
      <p className="text-sm font-semibold text-accent">Settings</p>
      <h1 className="mt-1 text-4xl font-semibold tracking-[-0.04em] text-slate-950">Make it yours</h1>
      <p className="mt-3 max-w-xl text-slate-600">Saved in this browser and applied right away.</p>
      <SettingsScreen />
    </div>
  );
}
