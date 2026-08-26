// The /records/data wire format (§16.12 payload budget). The ledger model
// repeats every name, slug, and metric descriptor per event and carries two
// derivable fields per event (`previousValue`, `improvementPct`); at ~2,700
// holders that was 5.2 MB raw / 533 KB brotli. The wire interns the repeated
// objects and drops the derivable fields; `decodeLedger` rebuilds the exact
// LedgerModel, so the island and every ledger derivation stay unchanged.
import type { PrimaryMetric } from "@/lib/catalog"
import type { LedgerHolder, LedgerModel, LedgerRow } from "./ledger-model"

type Ref = { name: string; slug: string }
type MetricShape = Pick<PrimaryMetric, "metric" | "unit" | "statistic">

/** [at (epoch ms), runId, implementation ref, metric shape, value,
 *  sampleCount, uncertainty] */
type WireEvent = [
  number,
  string,
  number,
  number,
  number,
  number | null,
  PrimaryMetric["uncertainty"],
]

/** Holder facts not recoverable from its newest event, in a fixed order:
 * [cohortKey hex (no "sha256:"), operation ref, workloadId, workloadSummary,
 *  hardware string, environment string, indexedAt (epoch ms), project ref,
 *  solScore, baseline, evidence, sourceAvailable, installable, license
 *  declared, concluded, history (newest first)]. `since` is the newest
 *  event's time. */
type WireHolder = [
  string,
  number,
  string,
  string,
  number,
  number,
  number,
  number,
  LedgerRow["solScore"],
  boolean,
  LedgerRow["evidence"],
  boolean,
  boolean,
  string | null,
  string | null,
  WireEvent[],
]

export type LedgerWire = Omit<LedgerModel, "records"> & {
  refs: Ref[]
  metrics: MetricShape[]
  strings: string[]
  holders: WireHolder[]
}

/** Assigns each distinct key one index, in first-seen order. */
function interner<T>(key: (value: T) => string) {
  const table: T[] = []
  const index = new Map<string, number>()
  return {
    table,
    of(value: T): number {
      const k = key(value)
      let i = index.get(k)
      if (i === undefined) {
        i = table.push(value) - 1
        index.set(k, i)
      }
      return i
    },
  }
}

const DIGEST_PREFIX = "sha256:"
const iso = (ms: number) => new Date(ms).toISOString()

export function encodeLedger(model: LedgerModel): LedgerWire {
  const refs = interner<Ref>((ref) => `${ref.slug}\0${ref.name}`)
  const metrics = interner<MetricShape>(
    (m) => `${m.metric}\0${m.unit}\0${m.statistic}`,
  )
  const strings = interner<string>((s) => s)
  const { records, ...rest } = model
  const holders = records.map((holder): WireHolder => {
    const row = holder.current
    return [
      holder.cohortKey.replace(DIGEST_PREFIX, ""),
      refs.of(holder.operation),
      holder.workloadId,
      holder.workloadSummary,
      strings.of(holder.hardware),
      strings.of(holder.environmentSummary),
      Date.parse(holder.indexedAt),
      refs.of(row.project),
      row.solScore,
      row.baseline,
      row.evidence,
      row.sourceAvailable,
      row.installable,
      row.license.declared,
      row.license.concluded,
      holder.history.map((event) => [
        Date.parse(event.at),
        event.runId,
        refs.of(event.implementation),
        metrics.of(event.value),
        event.value.value,
        event.value.sampleCount,
        event.value.uncertainty,
      ]),
    ]
  })
  return {
    ...rest,
    refs: refs.table,
    metrics: metrics.table,
    strings: strings.table,
    holders,
  }
}

export function decodeLedger(wire: LedgerWire): LedgerModel {
  const { refs, metrics, strings, holders, ...rest } = wire
  const metricOf = (event: WireEvent): PrimaryMetric => ({
    ...metrics[event[3]],
    value: event[4],
    sampleCount: event[5],
    uncertainty: event[6],
  })
  const records = holders.map((h): LedgerHolder => {
    const values = h[15].map(metricOf)
    const history = h[15].map((event, i) => {
      const value = values[i]
      // Newest first: the record this one beat is the next older event.
      const previousValue = values[i + 1] ?? null
      return {
        at: iso(event[0]),
        runId: event[1],
        implementation: refs[event[2]],
        value,
        previousValue,
        improvementPct: previousValue
          ? ((previousValue.value - value.value) / previousValue.value) * 100
          : null,
      }
    })
    const newest = history[0]
    return {
      cohortKey: DIGEST_PREFIX + h[0],
      operation: refs[h[1]],
      workloadId: h[2],
      workloadSummary: h[3],
      hardware: strings[h[4]],
      environmentSummary: strings[h[5]],
      current: {
        runId: newest.runId,
        implementation: newest.implementation,
        project: refs[h[7]],
        primary: newest.value,
        solScore: h[8],
        baseline: h[9],
        evidence: h[10],
        sourceAvailable: h[11],
        installable: h[12],
        license: { declared: h[13], concluded: h[14] },
      },
      since: newest.at,
      indexedAt: iso(h[6]),
      history,
    }
  })
  return { ...rest, records }
}
