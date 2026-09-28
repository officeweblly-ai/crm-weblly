import { ImageResponse } from "next/og";

/**
 * The home-screen icon: the weblly mark on the dark brand tile (same drawing
 * as src/app/icon.svg). Full-bleed square — iOS and Android round the corners.
 */
export function appIcon(size: number) {
  const mark = Math.round(size * 0.62);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1c2034" }}>
        <svg width={mark} height={Math.round((mark * 52) / 66)} viewBox="0 0 66 52" fill="none">
          <polyline points="7,44 20,15 34,44 47,15 59,7" stroke="#d5e2ff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <circle cx="7" cy="44" r="4.4" fill="#d5e2ff" />
          <circle cx="20" cy="15" r="4.4" fill="#d5e2ff" />
          <circle cx="34" cy="44" r="4.4" fill="#d5e2ff" />
          <circle cx="47" cy="15" r="4.4" fill="#d5e2ff" />
          <circle cx="59" cy="7" r="5.4" fill="#fc7a57" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
