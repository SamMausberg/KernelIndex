// Manifest-to-display projection shared by the PostgreSQL catalog reads.
// Components receive domain-ready display data; they never see table rows or
// raw manifests (§16.15).
import type {
  AxisSpec,
  EvidenceLevel,
  KeyValue,
  TensorBinding,
} from "../../lib/catalog-models.ts"
import { dtypeLabel } from "../../lib/format.ts"
import type {
  BenchmarkProtocolManifest,
  BenchmarkRunManifest,
  ExecutionEnvironmentManifest,
  OperationSpecManifest,
  WorkloadCaseManifest,
  WorkloadSuiteManifest,
} from "../../schemas/kinds.ts"
import type * as schema from "../db/schema.ts"
import { evidenceLevel } from "../policy/trust.ts"

export type RunRow = typeof schema.benchmarkRuns.$inferSelect

/** Stored run manifest shape: run plus its protocol/environment snapshots. */
export type StoredRunManifest = {
  run: BenchmarkRunManifest
  protocol: BenchmarkProtocolManifest
  environment: ExecutionEnvironmentManifest
}

export type AnyWorkloadManifest = WorkloadCaseManifest | WorkloadSuiteManifest

export const STALE_AFTER_DAYS = 180

export function isStale(observedAt: Date): boolean {
  return (
    Date.now() - observedAt.getTime() > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000
  )
}

/**
 * One cohort's genuine record sequence, oldest first (§11.10). `record_events`
 * is append-only, so it keeps events that a later-arriving or newly-eligible
 * run has since invalidated: a run that was the running minimum under an
 * older evidence set is not one now. Replaying the running minimum over the
 * stored events drops exactly those, which is what makes every displayed
 * margin an improvement and the last entry the cohort's fastest run.
 *
 * Callers pass rows already ordered oldest-first; unmeasured rows never rank.
 */
export function recordSequence<T>(
  rows: readonly T[],
  measure: (row: T) => number | null,
): T[] {
  const sequence: T[] = []
  let best: number | null = null
  for (const row of rows) {
    const value = measure(row)
    if (value === null || (best !== null && value >= best)) continue
    sequence.push(row)
    best = value
  }
  return sequence
}

/** The scalar columns trust derivation needs; every run select includes them. */
export type RunEvidenceInput = Pick<
  RunRow,
  | "reproducedByKernelindex"
  | "independentReplicationCount"
  | "sourceAvailable"
  | "installable"
  | "hasRawEvidence"
>

export function runEvidence(run: RunEvidenceInput): EvidenceLevel {
  return evidenceLevel({
    reproducedByKernelindex: run.reproducedByKernelindex,
    independentReplicationCount: run.independentReplicationCount,
    sourceAvailable: run.sourceAvailable,
    installable: run.installable,
    hasRawEvidence: run.hasRawEvidence,
    identityComplete: true,
  })
}

const EVIDENCE_ORDER: EvidenceLevel[] = [
  "reported",
  "reproducible",
  "verified",
  "replicated",
]

/** The strongest evidence across a revision's runs. Any surface that speaks
 * for the implementation (not one run) must use this, or its label can
 * contradict a per-run row — trust surfaces never disagree (§11.4). */
export function bestEvidence(runs: RunEvidenceInput[]): EvidenceLevel | null {
  let best = -1
  for (const run of runs)
    best = Math.max(best, EVIDENCE_ORDER.indexOf(runEvidence(run)))
  return best >= 0 ? EVIDENCE_ORDER[best] : null
}

const skip = (value: unknown): value is undefined | null =>
  value === undefined || value === null
const kv = (entries: [string, unknown][]): KeyValue[] =>
  entries
    .filter(([, value]) => !skip(value))
    .map(([key, value]) => ({ key, value: String(value) }))

export function protocolKeyValues(
  protocol: BenchmarkProtocolManifest,
): KeyValue[] {
  const m = protocol.spec.measurement
  return kv([
    [
      "harness",
      `${protocol.spec.harness.name}${protocol.spec.harness.version ? ` ${protocol.spec.harness.version}` : ""}`,
    ],
    ["timer", m.timer],
    ["synchronization", m.synchronization],
    ["compileIncluded", m.compileIncluded],
    ["warmupIterations", m.warmupIterations],
    ["measuredIterations", m.measuredIterations],
    ["samples", m.samples],
    ["inputRegeneration", m.inputRegeneration],
    ["primaryStatistic", m.primaryStatistic],
    ["outlierPolicy", m.outlierPolicy],
    ["correctnessReference", protocol.spec.correctness?.reference],
    ["comparabilityFamily", protocol.spec.comparability?.family],
  ])
}

export function environmentKeyValues(
  environment: ExecutionEnvironmentManifest,
): KeyValue[] {
  const { hardware, software, settings } = environment.spec
  return kv([
    ["gpu", `${hardware.product} (${hardware.architecture})`],
    ["gpuCount", hardware.count],
    ["memoryBytes", hardware.memoryBytes],
    ["operatingSystem", software.operatingSystem],
    ["driver", software.driver],
    ["cudaToolkit", software.cudaToolkit],
    [
      "framework",
      software.framework
        ? `${software.framework.name} ${software.framework.version}`
        : undefined,
    ],
    ["compiler", software.compiler],
    ["clocksLocked", settings?.clocksLocked],
    ["persistenceMode", settings?.persistenceMode],
    ["imageDigest", environment.spec.imageDigest],
  ])
}

export function workloadTensorKeyValues(
  workload: AnyWorkloadManifest,
): KeyValue[] {
  if (workload.kind === "WorkloadSuite") return []
  return Object.entries(workload.spec.tensors).map(([name, tensor]) => ({
    key: name,
    value: [
      tensor.dtype,
      `[${tensor.shape.join(", ")}]`,
      tensor.strides ? `strides [${tensor.strides.join(", ")}]` : null,
      tensor.alignmentBytes ? `align ${tensor.alignmentBytes}` : null,
    ]
      .filter(Boolean)
      .join(" "),
  }))
}

// "definition comparator" (not "comparator"): this is the workload
// definition's stated stack, which can legitimately differ in name from
// the evaluator on the run's protocol; distinct labels keep the two from
// reading as a contradiction (2026-08-25 review).
export function toleranceKeyValues(workload: AnyWorkloadManifest): KeyValue[] {
  if (workload.kind === "WorkloadSuite") {
    const suite = workload.spec.correctness
    return kv([
      ["definition comparator", suite.comparator],
      ["description", suite.description],
    ])
  }
  const c = workload.spec.correctness
  return kv([
    ["definition comparator", c.comparator],
    ["maxAbsoluteError", c.maxAbsoluteError],
    ["maxRelativeError", c.maxRelativeError],
    ["requiredMatchedRatio", c.requiredMatchedRatio],
    ["nanPolicy", c.nanPolicy],
    ["infinityPolicy", c.infinityPolicy],
  ])
}

export function toleranceSummary(workload: AnyWorkloadManifest): string {
  if (workload.kind === "WorkloadSuite")
    return workload.spec.correctness.comparator
  const c = workload.spec.correctness
  const parts: string[] = []
  if (c.maxAbsoluteError !== undefined)
    parts.push(`abs ≤ ${c.maxAbsoluteError}`)
  if (c.maxRelativeError !== undefined)
    parts.push(`rel ≤ ${c.maxRelativeError}`)
  if (c.requiredMatchedRatio !== undefined)
    parts.push(`matched ≥ ${c.requiredMatchedRatio * 100}%`)
  return parts.length > 0 ? parts.join(", ") : c.comparator
}

export function workloadLabel(
  workload: AnyWorkloadManifest,
  dtypes: string[],
): string {
  // The suite's own title only repeats the operation, which every surface
  // already names beside this label. Sources that don't declare how they
  // aggregate get the honest count alone — never the word "unspecified"
  // rendered as if it were a statistic.
  if (workload.kind === "WorkloadSuite") {
    const aggregation = [
      workload.spec.aggregation.statistic,
      workload.spec.aggregation.metric,
    ]
      .filter((part) => part && part !== "unspecified")
      .join(" ")
    return [`suite of ${workload.spec.cases.length} cases`, aggregation]
      .filter(Boolean)
      .join(" · ")
  }
  const axes = Object.entries(workload.spec.axes)
    .map(([name, value]) => `${name} = ${value}`)
    .join(" · ")
  return [axes, dtypeLabel(dtypes)].filter(Boolean).join(" · ")
}

export function operationAxisSpecs(
  operation: OperationSpecManifest,
): AxisSpec[] {
  return Object.entries(operation.spec.axes).map(([name, axis]) => ({
    name,
    role: axis.role,
    value: axis.value ?? null,
    constraint:
      axis.expression !== undefined
        ? `${name} = ${axis.expression}`
        : axis.minimum !== undefined || axis.maximum !== undefined
          ? [
              axis.minimum !== undefined ? `${name} >= ${axis.minimum}` : null,
              axis.maximum !== undefined ? `${name} <= ${axis.maximum}` : null,
            ]
              .filter(Boolean)
              .join(", ")
          : null,
  }))
}

export function operationTensorBindings(
  args: OperationSpecManifest["spec"]["inputs"],
): TensorBinding[] {
  return args.map((argument) => ({
    name: argument.name,
    dtype: argument.tensor?.dtype ?? argument.scalar?.dtype ?? "unknown",
    shape: argument.tensor ? `[${argument.tensor.shape.join(", ")}]` : "scalar",
    layout: argument.tensor?.layout ?? null,
  }))
}
