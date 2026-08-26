// Model index (§16.21): one catalog over both corpora. Each row states its
// kernel-side coverage (workload provenance declared by sources) and its
// serving-side coverage on an exact slug match; the two counts sit side by
// side and never merge into one ranking (§8.16). Kernel rows open the
// model's dossier; serving-only rows open the serving resolver.
import type { Metadata } from "next"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { ModelCatalog, type ModelCatalogRow } from "@/features/models/catalog"
import { getModelIndex } from "@/lib/catalog"
import { countNoun } from "@/lib/format"
import { servingEnabled } from "@/server/env"

export const metadata: Metadata = {
  title: "Models",
  description:
    "Model-aware GPU coverage: for each model, the operations KernelIndex knows are relevant, kernel benchmark evidence per GPU, and end-to-end serving evidence where it exists.",
  alternates: { canonical: "/models" },
}
export const revalidate = 3600

/** "70B" from a raw parameter count; models without one stay quiet. */
function paramsLabel(count: number | null): string | null {
  if (count === null) return null
  if (count >= 1e12) return `${(count / 1e12).toFixed(1).replace(/\.0$/, "")}T`
  if (count >= 1e9) return `${(count / 1e9).toFixed(1).replace(/\.0$/, "")}B`
  return `${Math.round(count / 1e6)}M`
}

export default async function ModelsPage() {
  const model = await getModelIndex()
  const serving = servingEnabled ? model.serving : []
  const servingBySlug = new Map(serving.map((entry) => [entry.slug, entry]))
  const kernelTags = new Set(model.kernel.map((entry) => entry.model))
  // Kernel rows keep their run-count order; serving-only rows follow, by
  // their own run counts. Names are data-provided only — the serving
  // source's display name on an exact slug match, never invented.
  const rows: ModelCatalogRow[] = [
    ...model.kernel.map((entry) => {
      const served = servingBySlug.get(entry.model)
      return {
        tag: entry.model,
        name: served?.name ?? null,
        operations: entry.operations,
        kernelRuns: entry.runs,
        gpus: entry.gpus,
        servingRuns: served?.runs ?? null,
        params: paramsLabel(served?.parameterCount ?? null),
      }
    }),
    ...serving
      .filter((entry) => !kernelTags.has(entry.slug))
      .sort((a, b) => b.runs - a.runs)
      .map((entry) => ({
        tag: entry.slug,
        name: entry.name,
        operations: null,
        kernelRuns: null,
        gpus: null,
        servingRuns: entry.runs,
        params: paramsLabel(entry.parameterCount),
      })),
  ]
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Models"
        meta={
          <span>
            {countNoun(model.kernel.length, "model")} with kernel evidence
            {servingEnabled &&
              ` · ${countNoun(serving.length, "serving model")}`}
          </span>
        }
      />
      <main className="shell pt-7 pb-24">
        <ModelCatalog rows={rows} />
        <p className="mt-6 flex max-w-[100ch] flex-wrap items-baseline gap-x-5 text-small text-faint">
          <span className="max-w-[76ch]">
            Model relevance is workload provenance declared by the imported
            sources, not a completeness claim; kernel and serving counts are
            separate corpora and never one ranking.
          </span>
          <Link href="/docs#sources" className="text-small text-faint">
            Sources and limitations
          </Link>
          <ApiLink path="/models" />
        </p>
      </main>
    </>
  )
}
