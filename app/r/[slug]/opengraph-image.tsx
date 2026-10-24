// Social preview for a public result: the idea, Brainy's pick and its
// saturation, on the colour card (it's a real cooked result).

import { ImageResponse } from "next/og";
import type { Result } from "@/lib/history";
import { logoDataUrl, PALETTE } from "@/lib/logo";
import { publicResult } from "@/lib/server/sync";

export const alt = "A Brainy result";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const clip = (text: string, max: number) => (text.length > max ? text.slice(0, max - 1) + "…" : text);

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const result = (await publicResult((await params).slug)) as Result | null;
  const idea = result ? clip(result.idea, 110) : "A Brainy result";
  const pick = result?.take?.pick.title;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#ffffff", color: "#0a0a0a" }}>
        <div
          style={{
            position: "absolute",
            right: -200,
            top: -220,
            width: 700,
            height: 1060,
            transform: "rotate(14deg)",
            opacity: 0.7,
            filter: "blur(60px)",
            background: `linear-gradient(120deg, ${PALETTE.violet}, ${PALETTE.pink}, ${PALETTE.orange}, ${PALETTE.cyan})`,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDataUrl({ color: true })} width={60} height={60} alt="" />
            <span style={{ fontSize: 44, fontWeight: 700, letterSpacing: -1.5 }}>brainy</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 800 }}>
            <div style={{ display: "flex", fontSize: 54, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1 }}>{idea}</div>
            {pick && (
              <div style={{ display: "flex", fontSize: 30, color: "#404040" }}>
                {`Brainy's pick: ${clip(pick, 60)}${result?.take ? ` · ${result.take.saturation}` : ""}`}
              </div>
            )}
          </div>
        </div>
      </div>
    ),
    size
  );
}
