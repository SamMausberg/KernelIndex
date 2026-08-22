// Project card: records held inside their own cohorts, kernels, runs, and
// the hardware measured (§16.18). Never a cross-cohort rank.
import { notFound } from "next/navigation"
import { OG_SIZE, ogCard } from "@/features/og/card"
import { getProjectPage } from "@/lib/catalog"
import { countNoun } from "@/lib/format"

export const alt = "KernelIndex project"
export const size = OG_SIZE
export const contentType = "image/png"
export const revalidate = 300

const KIND_LABEL = {
  library: "library",
  individual: "competition author",
  vendor: "vendor",
} as const

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const model = await getProjectPage((await params).slug)
  if (!model) notFound()
  const records = model.records.length
  return ogCard({
    eyebrow: "project",
    title: model.project.name,
    lead: [KIND_LABEL[model.project.kind], model.project.host?.id]
      .filter(Boolean)
      .join(" · "),
    readout: {
      value: String(records),
      unit: records === 1 ? "current record" : "current records",
    },
    lines: [
      `${countNoun(model.stats.implementations, model.project.kind === "individual" ? "entry" : "kernel")} · ${countNoun(model.stats.runs, "run")}`,
      model.stats.hardware.length > 0
        ? `measured on ${model.stats.hardware.join(", ")}`
        : "",
      model.project.licenses.length > 0
        ? model.project.licenses.join(", ")
        : "license unknown",
    ].filter(Boolean),
  })
}
