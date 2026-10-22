"use client";

import { useCooked } from "@/lib/reveal";

// The colour behind a cooked result: flowing diagonal bands plus blurred blobs,
// fading out toward the bottom. Invisible (and not animating) until the reveal.
export function MeshGradient() {
  const cooked = useCooked();
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 -z-10 transition-opacity duration-1000 ease-out [mask-image:linear-gradient(to_bottom,black_30%,transparent_95%)] ${
        cooked ? "opacity-50 dark:opacity-30" : "opacity-0"
      }`}
    >
      {cooked && (
        <>
          <div className="reveal-bands absolute inset-0" />
          <div className="animate-drift-a absolute -left-[10%] -top-[20%] h-[520px] w-[620px] rounded-full bg-reveal-violet/60 blur-[100px]" />
          <div className="animate-drift-b absolute -top-[15%] right-[-5%] h-[480px] w-[560px] rounded-full bg-reveal-cyan/50 blur-[100px]" />
          <div className="animate-drift-c absolute left-[30%] top-[10%] h-[420px] w-[520px] rounded-full bg-reveal-pink/50 blur-[110px]" />
          <div className="animate-drift-a absolute right-[10%] top-[30%] h-[360px] w-[440px] rounded-full bg-reveal-orange/50 blur-[110px] [animation-delay:-9s]" />
        </>
      )}
    </div>
  );
}
