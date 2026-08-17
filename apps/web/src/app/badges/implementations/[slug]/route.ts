// README badge (§16.18 machine discoverability): a flat SVG stating how
// many current records an implementation holds. Design-language conform:
// hairline border, matte surfaces, mono text, no gradients or icons. The
// count follows the ledger model, so a badge can never disagree with the
// records page.
import { getImplementationPage, getRecordsPage } from "@/lib/catalog"

export const revalidate = 3600

const FONT = "ui-monospace,SFMono-Regular,Menlo,monospace"
const CHAR = 6.3
const PAD = 7

function escapeXml(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const implementation = await getImplementationPage(slug.replace(/\.svg$/, ""))
  if (implementation === null) {
    return new Response("no such implementation", { status: 404 })
  }
  const { records } = await getRecordsPage()
  const held = records.filter(
    (holder) =>
      holder.current.implementation.slug === implementation.implementation.slug,
  ).length
  const label = "kernelindex"
  const status = held > 0 ? `${held} record${held === 1 ? "" : "s"}` : "indexed"
  const leftWidth = Math.round(label.length * CHAR + 2 * PAD)
  const rightWidth = Math.round(status.length * CHAR + 2 * PAD)
  const width = leftWidth + rightWidth
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="${escapeXml(`${label}: ${status}`)}">
  <clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath>
  <g clip-path="url(#r)" font-family="${FONT}" font-size="10" text-rendering="geometricPrecision">
    <rect width="${leftWidth}" height="20" fill="#0b0e18"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="20" fill="${held > 0 ? "#0e1729" : "#060810"}"/>
    <rect width="${width}" height="20" rx="3" fill="none" stroke="#1f2538"/>
    <text x="${leftWidth / 2}" y="13.5" text-anchor="middle" fill="#a2a8bb">${escapeXml(label)}</text>
    <text x="${leftWidth + rightWidth / 2}" y="13.5" text-anchor="middle" fill="${held > 0 ? "#8fb0ef" : "#757c93"}">${escapeXml(status)}</text>
  </g>
</svg>`
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  })
}
