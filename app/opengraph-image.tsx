// Social preview card: white canvas, the colour mark and wordmark, the tagline,
// and the reveal gradient blooming in from the right.

import { ImageResponse } from "next/og";
import { logoDataUrl, PALETTE } from "@/lib/logo";

export const alt = "Brainy: turn a half-baked idea into genuinely different finished versions.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", position: "relative", background: "#ffffff", color: "#0a0a0a" }}>
        <div
          style={{
            position: "absolute",
            right: -160,
            top: -200,
            width: 760,
            height: 1030,
            transform: "rotate(14deg)",
            opacity: 0.75,
            filter: "blur(60px)",
            background: `linear-gradient(120deg, ${PALETTE.violet}, ${PALETTE.pink}, ${PALETTE.orange}, ${PALETTE.cyan})`,
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoDataUrl({ color: true })} width={76} height={76} alt="" />
            <span style={{ fontSize: 60, fontWeight: 700, letterSpacing: -2 }}>brainy</span>
          </div>
          <div style={{ display: "flex", fontSize: 64, fontWeight: 700, letterSpacing: -2, lineHeight: 1.1, maxWidth: 720 }}>
            Turn a half-baked idea into genuinely different finished versions.
          </div>
        </div>
      </div>
    ),
    size
  );
}
