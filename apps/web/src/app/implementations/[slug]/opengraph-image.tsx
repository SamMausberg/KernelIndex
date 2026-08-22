// Implementation card: the best measurement, the project and license, the
// standing (§16.18). Every number names its GPU.
import { notFound } from "next/navigation"
import { OG_SIZE, ogCard } from "@/features/og/card"
import { getImplementationPage } from "@/lib/catalog"
import { countNoun, evidenceLabel, formatPrimaryParts } from "@/lib/format"

export const alt = "KernelIndex implementation"
export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 300

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const model = await getImplementationPage((await params).slug)
  if (!model) notFound()
  const best = model.bestResults[0] ?? null
  const measuredOn = [
    ...new Set(model.bestResults.map((row) => row.hardware.model)),
  ]
  return ogCard({
    eyebrow: "implementation",
    title: model.implementation.name,
    lead: [
      model.project.name,
      model.license.concluded ?? model.license.declared ?? "license unknown",
    ].join(" · "),
    readout: best?.primary ? formatPrimaryParts(best.primary) : null,
    fraction: best?.rank === 1 ? 1 : null,
    lines: [
      best
        ? `best measurement · ${best.operation.name} on ${best.hardware.model}${best.rank !== null ? ` · rank ${best.rank}` : ""}`
        : "no published measurement",
      model.standing.records > 0
        ? `holds ${countNoun(model.standing.records, "current record")}`
        : `${evidenceLabel(model.trust.evidence)} evidence`,
      measuredOn.length > 0 ? `measured on ${measuredOn.join(", ")}` : "",
    ].filter(Boolean),
  })
}
