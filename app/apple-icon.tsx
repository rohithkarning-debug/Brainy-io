// Home-screen icon: the white mark on a black rounded tile.

import { ImageResponse } from "next/og";
import { logoDataUrl } from "@/lib/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0a" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoDataUrl({ fill: "#ffffff" })} width={108} height={108} alt="" />
      </div>
    ),
    size
  );
}
