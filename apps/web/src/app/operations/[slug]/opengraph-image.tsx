// Operation card: the default cohort's best known number, its holder, and
// the operation's measured breadth (§16.18 machine discoverability).
import { notFound } from "next/navigation"
import { OG_SIZE, ogCard } from "@/features/og/card"
import { getOperationPage } from "@/lib/catalog"
import { countNoun, formatPrimaryParts } from "@/lib/format"

export const alt = "KernelIndex operation"
export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 3600

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const model = await getOperationPage((await params).slug)
  if (!model) notFound()
  const option =
    model.cohortOptions.find(
      (entry) => entry.key === model.cohort?.comparisonKey,
    ) ?? model.cohortOptions[0]
  const head = option?.head ?? null
  const runs = model.cohortOptions.reduce((n, entry) => n + entry.runs, 0)
  return ogCard({
    eyebrow: "operation",
    title: model.operation.name,
    lead:
      model.workloads.find((entry) => entry.id === model.selectedWorkloadId)
        ?.label ?? model.operation.family,
    readout: head ? formatPrimaryParts(head.primary) : null,
    fraction: head ? 1 : null,
    lines: [
      head && option
        ? `fastest known on ${option.label} · ${head.implementation.name}`
        : "no ranked measurement for the default workload",
      `${countNoun(runs, "run")} · ${countNoun(model.cohortOptions.length, "environment")} · ${countNoun(model.implementations.length, "implementation")}`,
    ],
  })
}
