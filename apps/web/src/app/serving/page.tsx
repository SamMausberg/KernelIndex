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
import { SkeletonRows } from "@/components/skeleton"
import { ServingOverview } from "@/features/serving/overview"
import { ServingCohorts } from "@/features/serving/results"
import {
  getServingFacets,
  getServingOverview,
  resolveServing,
} from "@/lib/catalog"
import { countNoun } from "@/lib/format"
import type {
  ServingResolveInput,
  ServingResolveModel,
} from "@/lib/serving-models"
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
      <div className="font-mono text-label text-faint uppercase">{label}</div>
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
    <div className="flex flex-col gap-1.5 text-small">
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
    <span className="well flex h-8 w-[96px] items-center gap-1 px-2">
      <input
        name={name}
        aria-label={ariaLabel}
        defaultValue={defaultValue ?? ""}
        inputMode="numeric"
        placeholder={placeholder}
        className="w-full min-w-0 bg-transparent font-mono text-small outline-none"
      />
      <span className="font-mono text-mini text-faint">ms</span>
    </span>
  )
}

/** The slow half: resolve, count, and render — streamed behind Suspense.
 * The resolve promise starts in the page body, before the facets await, so
 * the two reads overlap instead of forming a waterfall. */
async function ServingResults({
  resolved,
  requested,
  hideModel,
}: {
  resolved: Promise<ServingResolveModel>
  requested: boolean
  hideModel: boolean
}) {
  const model = await resolved
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
        <p className="font-mono text-small text-muted">
          {countNoun(model.groups.length, "comparison group")} · {feasible}{" "}
          feasible · {excluded} excluded
        </p>
        <p className="max-w-[68ch] text-small text-faint">
          Only runs with the same model, workload, protocol, hardware, and
          quality bar are ranked together. A run missing a metric you bounded is
          left out, not guessed.
        </p>
      </div>

      {model.groups.length > 0 ? (
        <>
          {/* Cohorts are deliberately granular (§11.1); the capped stream
              renders only for a narrowed request — the default view is the
              overview table. */}
          <ServingCohorts
            groups={model.groups.slice(0, GROUP_CAP)}
            hideModel={hideModel}
          />
          {model.groups.length > GROUP_CAP && (
            <p className="mt-8 text-small text-faint">
              {model.groups.length - GROUP_CAP} more comparison groups. Narrow
              by model, workload, or hardware to see them.
            </p>
          )}
        </>
      ) : (
        <p className="py-8 text-body text-faint">
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
  // Unfiltered, the corpus is hundreds of tiny comparison groups; the
  // default view is the overview table, and the resolver runs only once the
  // reader narrows by scope or bounds.
  const narrowed = Boolean(
    params.model ||
      params.workload ||
      params.hw ||
      params.gpus ||
      params.ttft ||
      params.tpot,
  )
  const resolved = narrowed ? resolveServing(inputOf(params)) : null
  // An early rejection (before the Suspense subtree awaits) must not become
  // an unhandled rejection; ServingResults still receives it on await.
  resolved?.catch(() => {})
  const [facets, overview] = await Promise.all([
    getServingFacets(),
    narrowed ? null : getServingOverview(),
  ])

  return (
    <>
      {facets.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Serving"
        // Single-source provenance stated plainly; revisit when a second
        // serving source lands.
        context={`${facets.totalRuns} results · all from MLPerf Inference, shown as published · ranked only when you pick an objective`}
      />
      <main className="shell animate-fade-in pb-24">
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
                className="well h-8 w-[70px] px-2 font-mono text-small outline-none"
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
          {/* Latency bounds are the power move, not the entry point: the
              disclosure keeps the console leading with model + hardware.
              It opens whenever a bound is set so active state stays visible. */}
          <details
            open={Boolean(params.ttft || params.tpot)}
            className="group self-end"
          >
            <summary className="flex h-8 cursor-pointer list-none items-center font-mono text-label text-faint uppercase transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              Latency bounds ›
            </summary>
            <div className="mt-2.5 flex flex-wrap items-end gap-x-4 gap-y-3">
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
            </div>
          </details>
          <button
            type="submit"
            className="key-primary h-8 cursor-pointer self-end px-5 text-small"
          >
            Resolve
          </button>
        </form>

        {narrowed && resolved ? (
          <Suspense
            fallback={
              <div className="pt-4">
                <SkeletonRows />
              </div>
            }
          >
            <ServingResults
              resolved={resolved}
              requested
              hideModel={Boolean(params.model)}
            />
          </Suspense>
        ) : (
          <section className="pt-5">
            <p className="max-w-[72ch] text-small text-faint">
              Best reported throughput per model and scenario. Open a row for
              every configuration, the Pareto frontier, and exclusions; add
              latency bounds above to resolve against your own limits.
            </p>
            <div className="mt-4">
              <ServingOverview rows={overview?.rows ?? []} />
            </div>
          </section>
        )}
      </main>
    </>
  )
}
