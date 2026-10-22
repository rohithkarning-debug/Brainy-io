import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-xl pt-20">
      <p className="text-sm font-semibold text-accent">404</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-[-0.03em] text-slate-950">Nothing cooking here</h1>
      <p className="mt-4 text-slate-600">That page doesn&apos;t exist.</p>
      <Link href="/" className="mt-8 inline-block rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-on-accent hover:bg-accent-dark">
        Back home
      </Link>
    </div>
  );
}
