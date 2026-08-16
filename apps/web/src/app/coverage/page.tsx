// Coverage & status (Week 12): exactly what the index contains, per
// source, with freshness and license terms — and what it does not claim.
// Honesty as a page: the §2.2 invariants, stated over live counts.
import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Section } from "@/components/section"
import { getCoveragePage } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"
import { servingEnabled } from "@/server/env"
import { FLASHINFER_SOURCE } from "@/server/import/flashinfer/types"
import { GPUMODE_SOURCE } from "@/server/import/gpumode/types"
import { MLPERF_SOURCE } from "@/server/import/mlperf/types"
import { SOL_SOURCE } from "@/server/import/sol/types"

export const metadata: Metadata = { title: "Coverage" }
export const revalidate = 300

/** Editorial facts per source; live counts come from the catalog seam. */
const FACTS: Record<
  string,
  { name: string; url: string; license: string; freshnessDays: number }
> = {
  [SOL_SOURCE.slug]: {
    name: SOL_SOURCE.name,
    url: "https://research.nvidia.com/benchmarks/sol-execbench",
    license: "public leaderboard API; source-native scores preserved",
    freshnessDays: SOL_SOURCE.policy.freshnessDays,
  },
  [GPUMODE_SOURCE.slug]: {
    name: GPUMODE_SOURCE.name,
    url: "https://huggingface.co/datasets/GPUMODE/kernelbot-data",
    license: "Researcher Reciprocity License v1.0, with attribution",
    freshnessDays: GPUMODE_SOURCE.policy.freshnessDays,
  },
  [FLASHINFER_SOURCE.slug]: {
    name: FLASHINFER_SOURCE.name,
    url: "https://huggingface.co/datasets/flashinfer-ai/flashinfer-trace",
    license: "Apache-2.0",
    freshnessDays: FLASHINFER_SOURCE.policy.freshnessDays,
  },
  [MLPERF_SOURCE.slug]: {
    name: MLPERF_SOURCE.name,
    url: "https://mlcommons.org/benchmarks/inference-datacenter/",
    license: "Apache-2.0 result repos; MLPerf™ is a trademark of MLCommons",
    freshnessDays: MLPERF_SOURCE.policy.freshnessDays,
  },
}

const LIMITATIONS = [
  "Every result is Reported-tier evidence: preserved exactly as the source published it, never independently rerun by KernelIndex. No verification runner exists yet, so no record carries a Verified or Replicated badge.",
  "SOL-ExecBench leaderboard rows are suite-scoped aggregates (suite mean latency), not per-case traces; they never answer an exact-case request as exact.",
  "FlashInfer-Bench imports are the library baseline solutions at a pinned dataset revision; LLM-generated traces are excluded.",
  "MLPerf serving rows publish one measured metric — output token throughput — as reported. TTFT/TPOT bounds ride along as rules-declared facts, not measurements.",
  "Hardware coverage follows the sources (NVIDIA B200 and H100, AMD MI300 families), not a survey; absence of an implementation here is not evidence it is slow.",
]

const GRID =
  "grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(72px,0.6fr))_minmax(110px,0.8fr)_minmax(200px,1.6fr)] items-baseline gap-x-4"

function SourceRows({
  rows,
  breadthLabel,
}: {
  rows: {
    slug: string
    runs: number
    breadth: number
    hardware: number
    lastFetched: string | null
  }[]
  breadthLabel: string
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div
          className={`${GRID} border-b border-border pb-2 font-mono text-[10px] tracking-[0.08em] text-faint uppercase`}
        >
          <span>Source</span>
          <span className="text-right">Runs</span>
          <span className="text-right">{breadthLabel}</span>
          <span className="text-right">GPUs</span>
          <span>Snapshot</span>
          <span>Upstream terms</span>
        </div>
        {rows.map((row) => {
          const facts = FACTS[row.slug]
          const fetched = row.lastFetched ? new Date(row.lastFetched) : null
          const stale =
            facts !== undefined &&
            fetched !== null &&
            Date.now() - fetched.getTime() > facts.freshnessDays * 86_400_000
          return (
            <div
              key={row.slug}
              className={`${GRID} border-b border-line py-2.5 text-[13px]`}
            >
              {facts ? (
                <a href={facts.url}>{facts.name}</a>
              ) : (
                <span className="font-mono text-[12px]">{row.slug}</span>
              )}
              <span className="text-right font-mono text-[12.5px]">
                {row.runs.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-[12.5px]">
                {row.breadth.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-[12.5px]">
                {row.hardware}
              </span>
              <span
                className={`font-mono text-[12px] ${stale ? "text-warning" : "text-subtle"}`}
              >
                {formatDateUTC(row.lastFetched)}
                {stale && " · stale"}
              </span>
              <span className="text-[12.5px] text-subtle">
                {facts?.license ?? "see source policy"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default async function CoveragePage() {
  const model = await getCoveragePage()
  const kernel = model.sources.filter((source) => source.kind === "kernel")
  const serving = model.sources.filter((source) => source.kind === "serving")
  const kernelRuns = kernel.reduce((n, source) => n + source.runs, 0)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Coverage"
        context="what this index contains, how fresh it is, and what it does not claim"
      />
      <main className="shell animate-fade-in pb-24">
        <Section id="kernel" title="Kernel evidence">
          <p className="mb-4 max-w-[76ch] text-[13.5px] text-muted">
            {kernelRuns.toLocaleString("en-US")} published kernel runs, every
            one linked to its exact workload, protocol, environment, source
            snapshot, and license state. Counts update as the weekly imports
            land; freshness is judged against each source&apos;s declared
            interval.
          </p>
          <SourceRows rows={kernel} breadthLabel="Ops" />
        </Section>

        {servingEnabled && serving.length > 0 && (
          <Section id="serving" title="Serving evidence">
            <p className="mb-4 max-w-[76ch] text-[13.5px] text-muted">
              Serving results live in separate tables with their own cohort
              semantics — a serving number and a kernel number are never ranked
              together. The breadth column counts distinct launch
              configurations.
            </p>
            <SourceRows rows={serving} breadthLabel="Configs" />
          </Section>
        )}

        <Section id="limitations" title="Known limitations">
          <ul className="max-w-[80ch] list-disc space-y-2.5 pl-5 text-[13.5px] text-muted">
            {LIMITATIONS.map((limitation) => (
              <li key={limitation.slice(0, 24)}>{limitation}</li>
            ))}
          </ul>
        </Section>

        <Section id="status" title="Data quality">
          <p className="max-w-[76ch] text-[13.5px] text-muted">
            A weekly workflow re-imports every source behind a machine gate
            (unexpected issues stop the source without writing), then runs the
            data-quality invariant checker: dangling references, supersession
            cycles, digest recomputation, orphan record events, snapshot
            freshness. The durable report is committed to{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/blob/main/registry/reports/source-health.json">
              registry/reports/source-health.json
            </a>
            ; versioned catalog exports live under{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/exports">
              registry/exports
            </a>
            . Something wrong? Every run dossier has a report action, and{" "}
            <Link href="/docs#records">corrections</Link> retract or supersede
            without rewriting history.
          </p>
        </Section>
      </main>
    </>
  )
}
