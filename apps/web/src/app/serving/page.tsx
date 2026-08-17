// Serving resolver (§16.13, §22.10): a distinct mode from kernel search.
// The form states model, hardware budget, workload, objective, and SLO
// bounds; results show feasible configurations per cohort and the Pareto
// frontier. There is no universal serving winner (§2.2 invariant 9).
//
// The form renders from the cached facets read and paints immediately; the
// resolve result streams in behind Suspense. Render-time caps keep the
// HTML bounded however large the corpus gets.
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { after } from "next/server"
import { Suspense } from "react"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Select } from "@/components/select"
import { ServingCohorts } from "@/features/serving/results"
import { getServingFacets, resolveServing } from "@/lib/catalog"
import { countNoun } from "@/lib/format"
import type { ServingResolveInput } from "@/lib/serving-models"
import { servingEnabled } from "@/server/env"
import { recordEvent } from "@/server/events"

export const metadata: Metadata = { title: "Serving" }

const GROUP_CAP = 12
const FACET_CAP = 80

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

/** Labeled console cluster: a tiny uppercase caption over a row of fields. */
function ConsoleGroup({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
        {label}
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">{children}</div>
    </div>
  )
}

/** Visible field caption; controls carry their own aria-label, since a
    wrapping <label> cannot associate with the custom Select button. */
function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5 text-[12px]">
      <span className="text-subtle">{label}</span>
      {children}
    </div>
  )
}

/** Recessed numeric input with a quiet unit suffix inside the well. */
function UnitInput({
  name,
  ariaLabel,
  defaultValue,
  placeholder,
}: {
  name: string
  ariaLabel: string
  defaultValue?: string
  placeholder: string
}) {
  return (
    <span className="well flex h-[30px] w-[96px] items-center gap-1 px-2">
      <input
        name={name}
        aria-label={ariaLabel}
        defaultValue={defaultValue ?? ""}
        inputMode="numeric"
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent font-mono text-[12px] outline-none"
      />
      <span className="font-mono text-[11px] text-faint">ms</span>
    </span>
  )
}

/** The slow half: resolve, count, and render — streamed behind Suspense. */
async function ServingResults({
  params,
  requested,
}: {
  params: Params
  requested: boolean
}) {
  const model = await resolveServing(inputOf(params))
  const feasible = model.groups.reduce((n, group) => n + group.rows.length, 0)
  // §20.5: only actual resolver requests count, not the default view.
  if (requested)
    after(() =>
      recordEvent("serving_resolved", {
        feasible: feasible > 0,
        cohorts: model.groups.length,
      }),
    )
  const excluded = model.groups.reduce(
    (n, group) => n + group.excluded.length,
    0,
  )

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1.5 py-4">
        <p className="font-mono text-[12.5px] text-muted">
          {countNoun(model.groups.length, "cohort")} · {feasible} feasible ·{" "}
          {excluded} excluded
        </p>
        <p className="max-w-[68ch] text-[12px] text-faint">
          Only runs with the same model, workload, protocol, hardware, and
          quality bar are ranked together. A run missing a metric you bounded is
          left out, not guessed.
        </p>
      </div>

      {model.groups.length > 0 ? (
        <>
          {/* Cohorts are deliberately granular (§11.1); an unfiltered view
              caps the page and asks for narrowing instead of rendering
              hundreds of tables. */}
          <ServingCohorts groups={model.groups.slice(0, GROUP_CAP)} />
          {model.groups.length > GROUP_CAP && (
            <p className="mt-8 text-[12.5px] text-faint">
              {model.groups.length - GROUP_CAP} more cohorts. Narrow by model,
              workload, or hardware to see them.
            </p>
          )}
        </>
      ) : (
        <p className="py-10 text-[13.5px] text-faint">
          {model.totalRuns === 0
            ? "No serving results yet."
            : "Nothing matches. Loosen the filters or bounds."}
        </p>
      )}
    </>
  )
}

export default async function ServingPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  if (!servingEnabled) notFound()
  const params = await searchParams
  const facets = await getServingFacets()

  return (
    <>
      {facets.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Serving"
        context={`${facets.totalRuns} results · ranked only when you pick an objective`}
      />
      <main className="shell animate-fade-in pb-20">
        <form
          method="GET"
          className="flex flex-wrap items-stretch gap-x-6 gap-y-4 border-b border-border py-5"
        >
          <ConsoleGroup label="Scope">
            <Field label="Model">
              <Select
                name="model"
                ariaLabel="Model"
                defaultValue={params.model ?? ""}
                className="min-w-[220px]"
                options={[
                  { value: "", label: "any" },
                  ...facets.models.slice(0, FACET_CAP).map((entry) => ({
                    value: entry.slug,
                    label: entry.name,
                    detail: `${entry.runs} runs`,
                  })),
                ]}
              />
            </Field>
            <Field label="Workload">
              <Select
                name="workload"
                ariaLabel="Workload"
                defaultValue={params.workload ?? ""}
                className="min-w-[220px]"
                options={[
                  { value: "", label: "any" },
                  ...facets.workloads.slice(0, FACET_CAP).map((entry) => ({
                    value: entry.slug,
                    label: entry.name,
                    detail: `${entry.runs} runs`,
                  })),
                ]}
              />
            </Field>
            <Field label="Hardware">
              <Select
                name="hw"
                ariaLabel="Hardware"
                defaultValue={params.hw ?? ""}
                className="min-w-[170px]"
                options={[
                  { value: "", label: "any" },
                  ...facets.hardware.slice(0, FACET_CAP).map((entry) => ({
                    value: entry,
                    label: entry,
                  })),
                ]}
              />
            </Field>
            <Field label="Max GPUs">
              <input
                name="gpus"
                aria-label="Max GPUs"
                defaultValue={params.gpus ?? ""}
                inputMode="numeric"
                placeholder="8"
                className="well h-[30px] w-[70px] px-2 font-mono text-[12px] outline-none"
              />
            </Field>
          </ConsoleGroup>
          <div aria-hidden="true" className="w-px bg-border" />
          <ConsoleGroup label="Objective">
            <Field label="Rank by">
              <Select
                name="objective"
                ariaLabel="Objective"
                defaultValue={params.objective ?? "throughput"}
                className="min-w-[200px]"
                options={[
                  { value: "throughput", label: "maximize tokens/s" },
                  { value: "ttft", label: "minimize TTFT p99" },
                  { value: "none", label: "none · show trade-offs" },
                ]}
              />
            </Field>
          </ConsoleGroup>
          <div aria-hidden="true" className="w-px bg-border" />
          <ConsoleGroup label="SLO bounds">
            <Field label="TTFT p99 ≤">
              <UnitInput
                name="ttft"
                ariaLabel="TTFT p99 bound (ms)"
                defaultValue={params.ttft}
                placeholder="450"
              />
            </Field>
            <Field label="TPOT p99 ≤">
              <UnitInput
                name="tpot"
                ariaLabel="TPOT p99 bound (ms)"
                defaultValue={params.tpot}
                placeholder="40"
              />
            </Field>
          </ConsoleGroup>
          <button
            type="submit"
            className="key-primary h-[30px] cursor-pointer self-end px-5 text-[12.5px]"
          >
            Resolve
          </button>
        </form>

        <Suspense
          fallback={
            <p className="py-4 font-mono text-[12.5px] text-faint">
              resolving…
            </p>
          }
        >
          <ServingResults
            params={params}
            requested={Object.keys(params).length > 0}
          />
        </Suspense>
      </main>
    </>
  )
}
