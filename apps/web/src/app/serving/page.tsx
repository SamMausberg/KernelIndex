// Serving resolver (§16.13, §22.10): a distinct mode from kernel search.
// The form states model, hardware budget, workload, objective, and SLO
// bounds; results show feasible configurations per cohort and the Pareto
// frontier. There is no universal serving winner (§2.2 invariant 9).
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { ServingCohorts } from "@/features/serving/results"
import { resolveServing } from "@/lib/catalog"
import type { ServingResolveInput } from "@/lib/serving-models"
import { servingEnabled } from "@/server/env"

export const metadata: Metadata = { title: "Serving" }
export const revalidate = 300

type Params = {
  model?: string
  workload?: string
  hw?: string
  gpus?: string
  objective?: string
  ttft?: string
  tpot?: string
}

function inputOf(params: Params): ServingResolveInput {
  const constraints: NonNullable<ServingResolveInput["constraints"]> = []
  const bound = (metric: string, raw: string | undefined) => {
    const value = Number(raw)
    if (raw && Number.isFinite(value) && value > 0)
      constraints.push({ metric, statistic: "p99", operator: "<=", value })
  }
  bound("ttft_ms", params.ttft)
  bound("tpot_ms", params.tpot)
  return {
    model: params.model || undefined,
    workload: params.workload || undefined,
    hardware:
      params.hw || params.gpus
        ? {
            model: params.hw || undefined,
            countMaximum:
              params.gpus && Number.isFinite(Number(params.gpus))
                ? Number(params.gpus)
                : undefined,
          }
        : undefined,
    objective:
      params.objective === "ttft"
        ? { direction: "minimize", metric: "ttft_ms", statistic: "p99" }
        : params.objective === "none"
          ? undefined
          : {
              direction: "maximize",
              metric: "output_token_throughput_tps",
              statistic: "reported",
            },
    constraints: constraints.length > 0 ? constraints : undefined,
  }
}

export default async function ServingPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  if (!servingEnabled) notFound()
  const params = await searchParams
  const model = await resolveServing(inputOf(params))

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Serving"
        context={`${model.totalRuns} serving results · ${model.policyVersion} · ranked only under an explicit objective, Pareto frontier otherwise`}
      />
      <main className="shell animate-fade-in pb-20">
        <form
          method="GET"
          className="flex flex-wrap items-end gap-x-5 gap-y-3 border-b border-border py-5 text-[12.5px]"
        >
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">Model</span>
            <select
              name="model"
              defaultValue={params.model ?? ""}
              className="well h-[30px] min-w-[220px] px-2 font-mono text-[12px] outline-none"
            >
              <option value="">any</option>
              {model.facets.models.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name} ({entry.runs})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">Workload</span>
            <select
              name="workload"
              defaultValue={params.workload ?? ""}
              className="well h-[30px] min-w-[220px] px-2 font-mono text-[12px] outline-none"
            >
              <option value="">any</option>
              {model.facets.workloads.map((entry) => (
                <option key={entry.slug} value={entry.slug}>
                  {entry.name} ({entry.runs})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">Hardware</span>
            <select
              name="hw"
              defaultValue={params.hw ?? ""}
              className="well h-[30px] min-w-[180px] px-2 font-mono text-[12px] outline-none"
            >
              <option value="">any</option>
              {model.facets.hardware.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">Max GPUs</span>
            <input
              name="gpus"
              defaultValue={params.gpus ?? ""}
              inputMode="numeric"
              placeholder="8"
              className="well h-[30px] w-[74px] px-2 font-mono text-[12px] outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">Objective</span>
            <select
              name="objective"
              defaultValue={params.objective ?? "throughput"}
              className="well h-[30px] min-w-[200px] px-2 font-mono text-[12px] outline-none"
            >
              <option value="throughput">maximize tokens/s</option>
              <option value="ttft">minimize TTFT p99</option>
              <option value="none">none · Pareto frontier</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">p99 TTFT ≤ ms</span>
            <input
              name="ttft"
              defaultValue={params.ttft ?? ""}
              inputMode="numeric"
              placeholder="450"
              className="well h-[30px] w-[84px] px-2 font-mono text-[12px] outline-none"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-faint">p99 TPOT ≤ ms</span>
            <input
              name="tpot"
              defaultValue={params.tpot ?? ""}
              inputMode="numeric"
              placeholder="40"
              className="well h-[30px] w-[84px] px-2 font-mono text-[12px] outline-none"
            />
          </label>
          <button
            type="submit"
            className="key h-[30px] cursor-pointer px-4 text-[12.5px] hover:text-fg"
          >
            Resolve
          </button>
        </form>

        <p className="max-w-[86ch] py-4 text-[12.5px] text-subtle">
          Serving results compare only when model, workload, protocol, hardware
          topology, and quality policy match; each group below is one such
          cohort. Constraints on unreported metrics exclude a candidate rather
          than assuming it. Imported results are Reported evidence, preserved
          exactly as published.
        </p>

        {model.groups.length > 0 ? (
          <ServingCohorts groups={model.groups} />
        ) : (
          <p className="py-10 text-[13.5px] text-faint">
            {model.totalRuns === 0
              ? "No serving results are published yet."
              : "Nothing matches these filters. Widen the model, hardware, or constraint bounds."}
          </p>
        )}
      </main>
    </>
  )
}
