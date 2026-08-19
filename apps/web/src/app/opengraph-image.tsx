// Site-wide social card (§16.18): the wordmark and promise on the matte
// canvas — flat, no glow, colors mirroring the globals.css tokens and the
// wordmark set in the site's own data face. Rendered once at build; also
// the twitter:image via the metadata route convention.
import { ImageResponse } from "next/og"

export const alt = "KernelIndex — the public performance index for GPU software"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

// globals.css tokens, mirrored: canvas / fg / subtle / faint / accent-dim.
const CANVAS = "#020309"
const FG = "#f2f4f9"
const SUBTLE = "#a2a8bb"
const FAINT = "#757c93"
const ACCENT_DIM = "#52699f"

/** IBM Plex Mono 500 as TTF: the css2 API serves truetype URLs when the
 * request carries no browser user agent. Falls back to the default face if
 * the fetch fails — the card renders either way. */
async function plexMono(): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500",
    ).then((response) => response.text())
    const url = css.match(/src: url\((.+?)\) format\('truetype'\)/)?.[1]
    if (!url) return null
    return await fetch(url).then((response) => response.arrayBuffer())
  } catch {
    return null
  }
}

export default async function Image() {
  const mono = await plexMono()
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: CANVAS,
        color: FG,
        padding: "72px 80px",
        fontFamily: mono ? "IBM Plex Mono" : "monospace",
      }}
    >
      <div style={{ display: "flex", fontSize: 28, color: SUBTLE }}>
        kernelindex.com
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 30,
          maxWidth: 940,
        }}
      >
        <div style={{ display: "flex", fontSize: 80, fontWeight: 500 }}>
          KernelIndex
        </div>
        <div
          style={{
            display: "flex",
            width: 400,
            height: 5,
            borderLeft: `1px solid ${ACCENT_DIM}`,
            borderRight: `1px solid ${ACCENT_DIM}`,
            alignItems: "center",
          }}
        >
          <div style={{ width: 260, height: 3, background: ACCENT_DIM }} />
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 38,
            lineHeight: 1.35,
            color: SUBTLE,
          }}
        >
          Find the fastest known GPU kernel for your exact workload.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24, color: FAINT }}>
        Ranked only against runs that measured the same thing.
      </div>
    </div>,
    {
      ...size,
      fonts: mono
        ? [{ name: "IBM Plex Mono", data: mono, weight: 500 as const }]
        : undefined,
    },
  )
}
