// The index's provenance, stated over live counts (§2.2 honesty invariants):
// per-source corpus rows with freshness and upstream terms, and the known
// limitations. Rendered in docs (#sources) and, compactly, on the homepage.
import { Link } from "@/components/quiet-link"
import type { CoverageSource } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"
import { FLASHINFER_SOURCE } from "@/server/import/flashinfer/types"
import { GPUMODE_SOURCE } from "@/server/import/gpumode/types"
import { LIGER_SOURCE } from "@/server/import/liger/types"
import { MLPERF_SOURCE } from "@/server/import/mlperf/types"
import { SOL_SOURCE } from "@/server/import/sol/types"

/** Editorial facts per source; live counts come from the catalog seam. */
export const SOURCE_FACTS: Record<
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

export const LIMITATIONS = [
  "Nothing here has been rerun by KernelIndex. Every number is shown exactly as its source published it, so no record is Verified yet.",
  "SOL-ExecBench leaderboard rows are suite averages, not per-case traces. They never answer an exact-case request.",
  "FlashInfer-Bench imports are pinned-revision library baselines plus explicitly labeled LLM-generated solutions; the label and generating model ride every such record.",
  "Liger-Kernel rows record no CUDA, driver, or torch version. Environments carry hardware only, and only kernels whose benchmark-script semantics were verified import.",
  "MLPerf serving rows measure one thing: token throughput. The TTFT/TPOT bounds shown are the benchmark's rules, not measurements.",
  "Hardware coverage follows the sources, not a survey. A GPU or kernel missing here says nothing about its speed.",
]

export function sourceIsStale(row: CoverageSource): boolean {
  const facts = SOURCE_FACTS[row.slug]
  return (
    facts !== undefined &&
    row.lastFetched !== null &&
    Date.now() - new Date(row.lastFetched).getTime() >
      facts.freshnessDays * 86_400_000
  )
}

const GRID =
  "grid grid-cols-[minmax(170px,1.3fr)_repeat(4,minmax(64px,0.55fr))_minmax(104px,0.8fr)_minmax(190px,1.5fr)] items-baseline gap-x-4"

/** Full per-source table: eligible vs indexed counts stay two labeled
 * numbers, never one word meaning both (§11.4). */
export function SourceTable({
  rows,
  breadthLabel,
}: {
  rows: CoverageSource[]
  breadthLabel: string
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px]">
        <div
          className={`${GRID} border-b border-border-strong pb-2 font-mono text-label text-faint uppercase`}
        >
          <span>Source</span>
          <span className="text-right">Ranked</span>
          <span className="text-right">Indexed</span>
          <span className="text-right">{breadthLabel}</span>
          <span className="text-right">GPUs</span>
          <span>Snapshot</span>
          <span>Upstream terms</span>
        </div>
        {rows.map((row) => {
          const facts = SOURCE_FACTS[row.slug]
          const stale = sourceIsStale(row)
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
              <span className="text-right font-mono text-small text-subtle">
                {row.indexed.toLocaleString("en-US")}
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

/** Homepage trust block (§16.5): where the numbers come from, how fresh they
 * are, and how much of the corpus each evidence level actually holds — with
 * the zero-reruns fact stated plainly, not implied. */
export function TrustBlock({
  sources,
  evidence,
}: {
  sources: CoverageSource[]
  evidence: { verified: number; reproducible: number; reported: number }
}) {
  const kernel = sources.filter((source) => source.kind === "kernel")
  const total = evidence.verified + evidence.reproducible + evidence.reported
  const segments = [
    {
      label: "Verified",
      count: evidence.verified,
      color: "var(--color-viz-1)",
    },
    {
      label: "Reproducible",
      count: evidence.reproducible,
      color: "var(--color-accent-dim)",
    },
    {
      label: "Reported",
      count: evidence.reported,
      color: "var(--color-border-strong)",
    },
  ].filter((segment) => segment.count > 0)
  return (
    <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(300px,1fr)] gap-10 max-lg:grid-cols-1">
      <div>
        <div className="border-b border-border-strong pb-2 font-mono text-label text-faint uppercase">
          Where the numbers come from
        </div>
        {kernel.map((row) => {
          const facts = SOURCE_FACTS[row.slug]
          return (
            <div
              key={row.slug}
              className="flex items-baseline justify-between gap-4 border-b border-line py-2.5"
            >
              <span className="min-w-0 truncate text-body">
                {facts ? <a href={facts.url}>{facts.name}</a> : row.slug}
              </span>
              <span className="font-mono text-small whitespace-nowrap text-subtle">
                {row.runs.toLocaleString("en-US")} runs ·{" "}
                <span
                  className={sourceIsStale(row) ? "text-warning" : "text-faint"}
                >
                  {formatDateUTC(row.lastFetched)}
                </span>
              </span>
            </div>
          )
        })}
      </div>
      <div>
        <div className="border-b border-border-strong pb-2 font-mono text-label text-faint uppercase">
          Evidence levels
        </div>
        {total > 0 && (
          <>
            <div className="mt-3 flex h-2.5 w-full gap-px overflow-hidden">
              {segments.map((segment) => (
                <span
                  key={segment.label}
                  style={{
                    width: `${Math.max((segment.count / total) * 100, 0.75)}%`,
                    background: segment.color,
                  }}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 font-mono text-mini text-subtle">
              {segments.map((segment) => (
                <span key={segment.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2 w-2"
                    style={{ background: segment.color }}
                  />
                  {segment.label} {segment.count.toLocaleString("en-US")}
                </span>
              ))}
            </div>
          </>
        )}
        <p className="mt-3.5 max-w-[52ch] text-small text-muted">
          Every result is imported from its source and shown as published.
          KernelIndex has not independently rerun any of them, so no result is
          Verified yet.{" "}
          <Link href="/docs#sources" className="text-small">
            Sources and limitations →
          </Link>
        </p>
      </div>
    </div>
  )
}
