// The Brainy mark: a sticky note shaped like a lowercase "b", with its
// bottom-right corner folded over. Drawn on a 32×32 grid so it stays crisp
// as a 16px favicon. Shared by the React <Logo> and the generated images
// (app/apple-icon.tsx, app/opengraph-image.tsx), so they can never drift apart.

// Stem + square bowl, with the folded corner cut off.
export const LOGO_BODY = "M5 2h3a2 2 0 0 1 2 2v7h15a3 3 0 0 1 3 3v8l-8 8H5a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z";
// The hole in the b.
export const LOGO_COUNTER = { x: 10, y: 15.5, width: 8, height: 8.5, rx: 2 };
// The gap around the folded flap.
export const LOGO_CREASE = "M28 22h-8v8";
// The flap itself, tinted lighter in the colour version.
export const LOGO_FLAP = "M20.9 22.9h6.1l-6.1 6.1z";

// The post-reveal palette, as gradient stops for the colour mark.
export const PALETTE = { violet: "#7c3aed", pink: "#ec4899", orange: "#fb923c", cyan: "#06b6d4" };
export const LOGO_STOPS: [offset: number, color: string][] = [
  [0, PALETTE.violet],
  [0.55, PALETTE.pink],
  [1, PALETTE.orange],
];

/** The mark as a standalone SVG string, for generated images. */
export function logoSvg({ color = false, fill = "#0a0a0a", size = 32 }: { color?: boolean; fill?: string; size?: number } = {}) {
  const c = LOGO_COUNTER;
  const stops = LOGO_STOPS.map(([o, s]) => `<stop offset="${o}" stop-color="${s}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="2" y1="2" x2="30" y2="30" gradientUnits="userSpaceOnUse">${stops}</linearGradient>
<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32"><path fill="white" d="${LOGO_BODY}"/>
<rect x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" rx="${c.rx}" fill="black"/>
<path d="${LOGO_CREASE}" stroke="black" stroke-width="1.8" fill="none"/></mask></defs>
<rect width="32" height="32" mask="url(#m)" fill="${color ? "url(#g)" : fill}"/>
${color ? `<path d="${LOGO_FLAP}" fill="white" fill-opacity="0.35"/>` : ""}</svg>`;
}

/** The same SVG as a data: URL, for an <img> inside ImageResponse. */
export function logoDataUrl(options?: Parameters<typeof logoSvg>[0]) {
  return `data:image/svg+xml;base64,${Buffer.from(logoSvg(options)).toString("base64")}`;
}
