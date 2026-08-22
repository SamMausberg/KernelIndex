// The Open Graph card (§16.18): one renderer for the site card and every
// dossier, so a pasted link shows the number it is about. Flat and matte
// like the pages: colors mirror the globals.css tokens, the calibrated rule
// is the only graphic, the identity face is Space Grotesk 500.
import { ImageResponse } from "next/og"
import { identityFace } from "./face"

export const OG_SIZE = { width: 1200, height: 630 }

const CANVAS = "#020309"
const FG = "#f2f4f9"
const SUBTLE = "#a2a8bb"
const FAINT = "#757c93"
const ACCENT_DIM = "#52699f"
const LINE = "#0f1220"

export type OgCard = {
  /** Top-right context: what kind of page this is. */
  eyebrow: string
  title: string
  /** One line under the title at reading size: the workload, the promise. */
  lead?: string | null
  /** The one number the page is about; absent on index-like pages. */
  readout?: { value: string; unit: string } | null
  /** Fill of the calibrated rule, 0–1 (best / value); absent draws none. */
  fraction?: number | null
  /** Up to three quiet facts. */
  lines?: string[]
  /** Closing line; the site card states the ranking promise, dossiers let
   * their facts end the card. */
  footer?: string | null
}

const ellipsis = {
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
} as const

export async function ogCard(card: OgCard): Promise<ImageResponse> {
  const face = await identityFace()
  const fraction =
    card.fraction == null ? null : Math.min(1, Math.max(0, card.fraction))
  const titleSize =
    card.title.length <= 14 ? 80 : card.title.length <= 30 ? 58 : 44
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
        padding: "64px 80px",
        fontFamily: face ? "Space Grotesk" : "sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 26,
          color: SUBTLE,
        }}
      >
        <span>kernelindex.com</span>
        <span style={{ color: FAINT }}>{card.eyebrow}</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 1040,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: titleSize,
            fontWeight: 500,
            lineHeight: 1.12,
            maxWidth: 1040,
            ...ellipsis,
          }}
        >
          {card.title}
        </div>
        {card.lead && (
          <div
            style={{
              display: "flex",
              fontSize: 34,
              lineHeight: 1.3,
              color: SUBTLE,
              maxWidth: 1040,
              ...ellipsis,
            }}
          >
            {card.lead}
          </div>
        )}
        {card.readout && (
          <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 92, fontWeight: 500, lineHeight: 1 }}>
              {card.readout.value}
            </span>
            <span style={{ fontSize: 38, color: SUBTLE }}>
              {card.readout.unit}
            </span>
          </div>
        )}
        {fraction !== null && (
          <div
            style={{
              display: "flex",
              position: "relative",
              width: 400,
              height: 5,
              borderLeft: `1px solid ${ACCENT_DIM}`,
              borderRight: `1px solid ${ACCENT_DIM}`,
              alignItems: "center",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 2,
                height: 1,
                background: LINE,
              }}
            />
            <div
              style={{
                width: Math.round(fraction * 400),
                height: 3,
                background: ACCENT_DIM,
              }}
            />
          </div>
        )}
        {(card.lines ?? []).slice(0, 3).map((line, index) => (
          <div
            key={line}
            style={{
              display: "flex",
              fontSize: 26,
              lineHeight: 1.3,
              color: index === 0 ? SUBTLE : FAINT,
              marginTop: index === 0 ? 0 : -14,
              maxWidth: 1040,
              ...ellipsis,
            }}
          >
            {line}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", fontSize: 22, color: FAINT }}>
        {card.footer ?? ""}
      </div>
    </div>,
    {
      ...OG_SIZE,
      fonts: face
        ? [{ name: "Space Grotesk", data: face, weight: 500 as const }]
        : undefined,
    },
  )
}
