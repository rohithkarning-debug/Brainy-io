// Soft animated mesh behind the hero: blurred blobs that fade out toward the bottom.
export function MeshGradient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[780px] [mask-image:linear-gradient(to_bottom,black_45%,transparent)]"
    >
      <div className="animate-drift-a absolute -left-[10%] -top-[20%] h-[520px] w-[620px] rounded-full bg-violet-400/50 blur-[100px]" />
      <div className="animate-drift-b absolute right-[-5%] -top-[15%] h-[480px] w-[560px] rounded-full bg-sky-400/45 blur-[100px]" />
      <div className="animate-drift-c absolute left-[30%] top-[10%] h-[420px] w-[520px] rounded-full bg-pink-400/40 blur-[110px]" />
      <div className="animate-drift-a absolute right-[10%] top-[30%] h-[360px] w-[440px] rounded-full bg-orange-300/45 blur-[110px] [animation-delay:-9s]" />
    </div>
  );
}
