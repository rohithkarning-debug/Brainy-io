// Top bar: a small gradient mark plus the name.
export function Nav() {
  return (
    <nav className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent via-fuchsia-500 to-orange-400 text-sm font-bold text-white shadow-card">
          b
        </span>
        <span className="text-lg font-semibold tracking-tight text-slate-950">brainy</span>
      </div>
      <span className="hidden rounded-full bg-white/60 px-3 py-1 text-xs font-medium text-slate-600 backdrop-blur sm:inline">
        3 models · live search · 1 honest judge
      </span>
    </nav>
  );
}
