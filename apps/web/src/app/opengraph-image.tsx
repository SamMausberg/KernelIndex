// Site-wide social card (§16.18): the wordmark and promise on the matte
// canvas — flat, no glow, matching the globals.css tokens. Rendered once at
// build; also the twitter:image via the metadata route convention.
import { ImageResponse } from "next/og"

export const alt = "KernelIndex — the public performance index for GPU software"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#020309",
        color: "#f2f4f9",
        padding: "72px 80px",
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", fontSize: 30, color: "#a2a8bb" }}>
        kernelindex.com
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 28,
          maxWidth: 900,
        }}
      >
        <div style={{ display: "flex", fontSize: 84, fontWeight: 600 }}>
          KernelIndex
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            lineHeight: 1.3,
            color: "#a2a8bb",
          }}
        >
          Find the fastest known GPU kernel for your exact workload.
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 26, color: "#757c93" }}>
        Ranked only against runs that measured the same thing.
      </div>
    </div>,
    size,
  )
}
