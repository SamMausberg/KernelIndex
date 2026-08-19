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
import { LIGER_SOURCE } from "@/server/import/liger/types"
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
  [LIGER_SOURCE.slug]: {
    name: LIGER_SOURCE.name,
    url: "https://github.com/linkedin/Liger-Kernel",
    license: "BSD-2-Clause; environment metadata incomplete upstream",
    freshnessDays: LIGER_SOURCE.policy.freshnessDays,
  },
}

const LIMITATIONS = [
  "Nothing here has been rerun by KernelIndex. Every number is shown exactly as its source published it, so no record is Verified yet.",
  "SOL-ExecBench leaderboard rows are suite averages, not per-case traces. They never answer an exact-case request.",
  "FlashInfer-Bench imports are the library baselines at a pinned revision; LLM-generated traces are excluded.",
  "Liger-Kernel rows record no CUDA, driver, or torch version. Environments carry hardware only, and only kernels whose benchmark-script semantics were verified import.",
  "MLPerf serving rows measure one thing: token throughput. The TTFT/TPOT bounds shown are the benchmark's rules, not measurements.",
  "Hardware coverage follows the sources, not a survey. A GPU or kernel missing here says nothing about its speed.",
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
          className={`${GRID} border-b border-border pb-2 font-mono text-label text-faint uppercase`}
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
              className={`${GRID} border-b border-line py-2.5 text-body`}
            >
              {facts ? (
                <a href={facts.url}>{facts.name}</a>
              ) : (
                <span className="font-mono text-small">{row.slug}</span>
              )}
              <span className="text-right font-mono text-small">
                {row.runs.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-small">
                {row.breadth.toLocaleString("en-US")}
              </span>
              <span className="text-right font-mono text-small">
                {row.hardware}
              </span>
              <span
                className={`font-mono text-small ${stale ? "text-warning" : "text-subtle"}`}
              >
                {formatDateUTC(row.lastFetched)}
                {stale && " · stale"}
              </span>
              <span className="text-small text-subtle">
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
          <p className="mb-4 max-w-[76ch] text-body text-muted">
            {kernelRuns.toLocaleString("en-US")} published kernel runs, each
            linked to its workload, protocol, environment, source snapshot, and
            license. Counts update with the weekly imports.
          </p>
          <SourceRows rows={kernel} breadthLabel="Ops" />
        </Section>

        <Section id="priority" title="Priority coverage">
          <p className="mb-4 max-w-[76ch] text-body text-muted">
            The operations an inference engineer asks about first, on the GPUs
            they ask about first. Published runs per cell; a zero is a stated
            gap, not a claim.
          </p>
          <div className="overflow-x-auto">
            <div className="min-w-[560px] max-w-[720px]">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-border pb-2 font-mono text-label text-faint uppercase">
                <span>Family</span>
                {model.hero.gpus.map((gpu) => (
                  <span key={gpu} className="text-right">
                    {gpu.replace("NVIDIA ", "")}
                  </span>
                ))}
                <span className="text-right">All GPUs</span>
              </div>
              {model.hero.rows.map((row) => (
                <div
                  key={row.family}
                  className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-line py-2.5 text-body"
                >
                  <Link
                    href={`/search?q=${encodeURIComponent(row.family)}`}
                    className="font-mono text-small"
                  >
                    {row.family}
                  </Link>
                  {row.runs.map((runs, index) => (
                    <span
                      key={model.hero.gpus[index]}
                      className={`text-right font-mono text-small ${runs === 0 ? "text-faint" : ""}`}
                    >
                      {runs === 0 ? "0 · gap" : runs.toLocaleString("en-US")}
                    </span>
                  ))}
                  <span className="text-right font-mono text-small text-subtle">
                    {row.total.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {servingEnabled && serving.length > 0 && (
          <Section id="serving" title="Serving evidence">
            <p className="mb-4 max-w-[76ch] text-body text-muted">
              Serving results are kept apart from kernel results — the two are
              never ranked together. Configs counts distinct launch
              configurations.
            </p>
            <SourceRows rows={serving} breadthLabel="Configs" />
          </Section>
        )}

        <Section id="limitations" title="Known limitations">
          <ul className="max-w-[80ch] list-disc space-y-2.5 pl-5 text-body text-muted">
            {LIMITATIONS.map((limitation) => (
              <li key={limitation.slice(0, 24)}>{limitation}</li>
            ))}
          </ul>
        </Section>

        <Section id="status" title="Data quality">
          <p className="max-w-[76ch] text-body text-muted">
            A weekly job re-imports every source; anything unexpected stops that
            source before it writes. An invariant checker then audits the whole
            catalog. The report lives at{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/blob/main/registry/reports/source-health.json">
              registry/reports/source-health.json
            </a>
            ; versioned catalog exports live under{" "}
            <a href="https://github.com/SamMausberg/KernelIndex/tree/main/registry/exports">
              registry/exports
            </a>
            . Something wrong? Every run page has a report action. Corrections{" "}
            <Link href="/docs#records">retract or supersede</Link>, never
            rewrite.
          </p>
        </Section>
      </main>
    </>
  )
}
