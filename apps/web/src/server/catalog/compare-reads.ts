// Aligned run comparison (§16.11): two to eight runs, ranked only when they
// share one comparison cohort and are all eligible; otherwise the field diff
// names the first material mismatch and what would need to match.
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm"
import type { ComparePageModel, CompareRun } from "../../lib/catalog-models.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  eligibilityReasons,
  RANKING_POLICY_VERSION,
  rankCohort,
} from "../policy/ranking.ts"
import {
  type AnyWorkloadManifest,
  runEvidence,
  type StoredRunManifest,
  workloadLabel,
} from "./present.ts"
import { rankInputOf, resultRow, UUID_PATTERN } from "./run-rows.ts"

const MAX_COMPARE = 8

/** Short digest for aligned compare cells. */
const short = (digest: string) => digest.replace("sha256:", "").slice(0, 8)

export async function getComparePage(
  runIds: string[],
): Promise<ComparePageModel> {
  const wanted = [...new Set(runIds)]
    .filter((id) => UUID_PATTERN.test(id) || id.startsWith("sha256:"))
    .slice(0, MAX_COMPARE)
  const empty: ComparePageModel = {
    illustrative: false,
    runs: [],
    comparable: false,
    profile: null,
    comparisonKey: null,
    fields: [],
    firstMaterialMismatch: null,
    explanation:
      "Select two to eight runs to compare. Every result row and run detail page links here.",
    missingIds: [],
    policyVersion: RANKING_POLICY_VERSION,
  }
  if (wanted.length === 0) return empty

  const uuids = wanted.filter((id) => UUID_PATTERN.test(id))
  const digests = wanted.filter((id) => id.startsWith("sha256:"))
  const rows = await db()
    .select({
      run: schema.benchmarkRuns,
      implementation: schema.implementations,
      project: schema.projects,
      workload: schema.workloads,
      source: schema.sources,
      operation: schema.operations,
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.implementations,
      eq(schema.benchmarkRuns.implementationId, schema.implementations.id),
    )
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .innerJoin(
      schema.operations,
      eq(schema.workloads.operationId, schema.operations.id),
    )
    .innerJoin(
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(
      and(
        isNotNull(schema.benchmarkRuns.publishedAt),
        uuids.length > 0 && digests.length > 0
          ? sql`(${inArray(schema.benchmarkRuns.id, uuids)} or ${inArray(schema.benchmarkRuns.runDigest, digests)})`
          : uuids.length > 0
            ? inArray(schema.benchmarkRuns.id, uuids)
            : inArray(schema.benchmarkRuns.runDigest, digests),
      ),
    )
  const ordered = wanted
    .map((id) =>
      rows.find((row) => row.run.id === id || row.run.runDigest === id),
    )
    .filter((row): row is (typeof rows)[number] => row !== undefined)
  const missingIds = wanted.filter(
    (id) => !rows.some((row) => row.run.id === id || row.run.runDigest === id),
  )
  if (ordered.length === 0) return { ...empty, missingIds }

  const supersededRows = await db()
    .select({ supersedesId: schema.benchmarkRuns.supersedesId })
    .from(schema.benchmarkRuns)
    .where(
      and(
        inArray(
          schema.benchmarkRuns.supersedesId,
          ordered.map((row) => row.run.id),
        ),
        isNotNull(schema.benchmarkRuns.publishedAt),
      ),
    )
  const supersededIds = new Set(supersededRows.map((row) => row.supersedesId))

  const eligibleById = new Map(
    ordered.map((row) => [
      row.run.id,
      eligibilityReasons({
        status: row.run.status,
        published: row.run.publishedAt !== null,
        retracted: row.run.retractedAt !== null,
        superseded: supersededIds.has(row.run.id),
        primaryValue: row.run.primaryValue,
      }),
    ]),
  )
  const sourceNative = ordered.some((row) => row.run.sourceNative)
  const profile = sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  const sharedCohort = ordered.every(
    (row) => row.run.comparisonKey === ordered[0].run.comparisonKey,
  )
  const comparable =
    ordered.length >= 2 &&
    sharedCohort &&
    ordered.every((row) => (eligibleById.get(row.run.id) ?? []).length === 0)

  const rankById = new Map<string, { rank: number; tied: boolean }>()
  if (comparable) {
    for (const entry of rankCohort(
      ordered.map((row) => rankInputOf(row)),
      profile,
    )) {
      rankById.set(entry.id, { rank: entry.rank, tied: entry.tiedWithPrevious })
    }
  }

  const runs: CompareRun[] = ordered.map((row) => {
    const base = resultRow(row, {
      name: row.operation.name,
      slug: row.operation.slug,
    })
    const reasons = eligibleById.get(row.run.id) ?? []
    return {
      runId: row.run.id,
      digest: row.run.runDigest,
      implementation: base.implementation,
      project: base.project,
      operation: base.operation,
      workloadLabel: workloadLabel(
        row.workload.manifest as AnyWorkloadManifest,
        row.workload.dtypes,
      ),
      hardware: row.run.hardwareModel,
      primary: base.primary,
      evidence: base.evidence as CompareRun["evidence"],
      status: row.run.status as CompareRun["status"],
      comparisonKey: row.run.comparisonKey,
      rank: rankById.get(row.run.id)?.rank ?? null,
      tiedWithPrevious: rankById.get(row.run.id)?.tied ?? false,
      eligible: reasons.length === 0,
      ineligibleReasons: reasons,
      license: base.license,
      install: base.install,
      sourceAvailable: row.implementation.sourceAvailable,
      observedAt: row.run.observedAt.toISOString(),
    }
  })

  const field = (
    name: string,
    material: boolean,
    value: (row: (typeof ordered)[number]) => string | null,
  ) => {
    const values = ordered.map(value)
    const distinct = new Set(values.map((entry) => entry ?? "∅"))
    return { field: name, material, values, differs: distinct.size > 1 }
  }
  const fields = [
    field("operation", true, (row) => row.operation.slug),
    field(
      "workload",
      true,
      (row) =>
        `${workloadLabel(row.workload.manifest as AnyWorkloadManifest, row.workload.dtypes)} · ${short(row.workload.workloadDigest)}`,
    ),
    field("protocol", true, (row) => {
      const stored = row.run.manifest as StoredRunManifest
      return `${stored.protocol.spec.harness.name} · ${short(row.run.protocolKey)}`
    }),
    field(
      "environment",
      true,
      (row) => `${row.run.hardwareModel} · ${short(row.run.environmentKey)}`,
    ),
    field("correctness policy", true, (row) => short(row.run.correctnessKey)),
    field("metric", true, (row) => {
      return `${row.run.primaryMetric} ${row.run.primaryStatistic ?? "value"} (${row.run.primaryUnit ?? "—"})`
    }),
    field("architecture", false, (row) => row.run.hardwareArchitecture),
    field("CUDA", false, (row) => {
      const stored = row.run.manifest as StoredRunManifest
      return stored.environment.spec.software.cudaToolkit ?? null
    }),
    field("driver", false, (row) => {
      const stored = row.run.manifest as StoredRunManifest
      return stored.environment.spec.software.driver ?? null
    }),
    field("framework", false, (row) => {
      const framework = (row.run.manifest as StoredRunManifest).environment.spec
        .software.framework
      return framework ? `${framework.name} ${framework.version}` : null
    }),
    field("samples", false, (row) =>
      row.run.sampleCount !== null ? String(row.run.sampleCount) : null,
    ),
    field("evidence", false, (row) => runEvidence(row.run)),
    field("license", false, (row) => row.implementation.licenseExpression),
    field("source", false, (row) =>
      row.implementation.sourceAvailable ? "available" : "unavailable",
    ),
    field("status", false, (row) => row.run.status),
    field("observed", false, (row) =>
      row.run.observedAt.toISOString().slice(0, 10),
    ),
  ]
  const firstMaterialMismatch =
    fields.find((entry) => entry.material && entry.differs)?.field ?? null

  const explanation = comparable
    ? `All ${ordered.length} runs share one ${profile === "source_native" ? "source-native" : "strict exact"} comparison cohort; ranks follow ${RANKING_POLICY_VERSION}.`
    : ordered.length < 2
      ? "Add at least one more run to compare."
      : firstMaterialMismatch !== null
        ? `No winner can be declared: ${firstMaterialMismatch} differs. A valid comparison requires identical operation, workload, protocol, environment, correctness policy, and metric.`
        : "No winner can be declared: at least one selected run is not eligible for ranking."

  return {
    illustrative: ordered.every((row) => row.source.kind === "illustrative"),
    runs,
    comparable,
    profile: sharedCohort ? profile : null,
    comparisonKey: sharedCohort ? ordered[0].run.comparisonKey : null,
    fields,
    firstMaterialMismatch,
    explanation,
    missingIds,
    policyVersion: RANKING_POLICY_VERSION,
  }
}
