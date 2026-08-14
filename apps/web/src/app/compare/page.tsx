import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { SiteHeader } from "@/components/site-header"
import { CompareView } from "@/features/compare/compare-view"
import { getComparePage } from "@/lib/catalog"

export const metadata: Metadata = { title: "Compare" }

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string | string[] }>
}) {
  const params = await searchParams
  const runIds =
    params.run === undefined
      ? []
      : Array.isArray(params.run)
        ? params.run
        : [params.run]
  const model = await getComparePage(runIds)
  return (
    <>
      <SiteHeader />
      {model.illustrative && <IllustrativeNotice />}
      <div className="h-px origin-left animate-scan bg-accent" />
      <ContextHeader
        title="Compare runs"
        context={
          model.comparisonKey
            ? `cohort ${model.comparisonKey.slice(0, 23)}… · ${model.profile === "source_native" ? "source-native" : "strict exact"} profile`
            : `${model.runs.length} run${model.runs.length === 1 ? "" : "s"} selected · no shared cohort`
        }
        meta={<span>{model.policyVersion}</span>}
      />
      <CompareView model={model} />
    </>
  )
}
