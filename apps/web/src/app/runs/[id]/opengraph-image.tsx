// Run card: the number, its rank inside its comparison group, and the facts
// that qualify it (§16.18). The rule reads best / this value, so a pasted
// link shows the gap to #1 at a glance.
import { notFound } from "next/navigation"
import { OG_SIZE, ogCard } from "@/features/og/card"
import { getRunPage } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC, formatPrimaryParts } from "@/lib/format"

export const alt = "KernelIndex run dossier"
export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 300

export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const model = await getRunPage((await params).id)
  if (!model) notFound()
  const headId = model.cohort.headRunId
  const head =
    headId !== null && headId !== model.run.id ? await getRunPage(headId) : null
  const fact = (key: string) =>
    model.environment.find((entry) => entry.key === key)?.value
  const environment = [
    fact("gpu"),
    fact("cudaToolkit") ? `CUDA ${fact("cudaToolkit")}` : null,
    fact("framework"),
  ].filter(Boolean)
  return ogCard({
    eyebrow: "run dossier",
    title: model.implementation.name,
    lead: `${model.operation.name} · ${model.workload.label}`,
    readout: formatPrimaryParts(model.primary),
    fraction: head
      ? head.primary.value / model.primary.value
      : model.cohort.rank === 1
        ? 1
        : null,
    lines: [
      model.cohort.rank !== null
        ? `rank ${model.cohort.rank} in its comparison group · ${evidenceLabel(model.evidence)} evidence`
        : `${evidenceLabel(model.evidence)} evidence · not ranked${model.cohort.ineligibleReasons[0] ? ` (${model.cohort.ineligibleReasons[0]})` : ""}`,
      environment.join(" · "),
      `${model.provenance.source.name} · observed ${formatDateUTC(model.run.observedAt)}`,
    ].filter(Boolean),
  })
}
