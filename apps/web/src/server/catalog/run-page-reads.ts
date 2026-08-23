// Run dossier read (§16.7): one published run by id or sha256 digest, with
// its full protocol, environment, correctness, artifacts, lifecycle, and
// cohort standing. The run page shows any published run including failed,
// superseded, and retracted evidence.
import { and, eq, isNotNull } from "drizzle-orm"
import type { RunPageModel } from "../../lib/catalog-models.ts"
import { implementationDisplayName } from "../../lib/names.ts"
import type { ImplementationRevisionManifest } from "../../schemas/kinds.ts"
import { attestationsFor } from "../attestations.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { eligibilityReasons } from "../policy/ranking.ts"
import { cohortRanks } from "./cohorts.ts"
import {
  type AnyWorkloadManifest,
  environmentKeyValues,
  isStale,
  protocolKeyValues,
  runEvidence,
  type StoredRunManifest,
  toleranceKeyValues,
  workloadLabel,
  workloadTensorKeyValues,
} from "./present.ts"
import { opRef, sourcePolicy, UUID_PATTERN } from "./run-rows.ts"

export async function getRunPage(id: string): Promise<RunPageModel | null> {
  const database = db()
  const byDigest = id.startsWith("sha256:")
  if (!byDigest && !UUID_PATTERN.test(id)) return null
  const [row] = await database
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
      byDigest
        ? eq(schema.benchmarkRuns.runDigest, id)
        : eq(schema.benchmarkRuns.id, id),
    )
  if (!row || row.run.publishedAt === null) return null
  const { run, implementation, project, workload, source, operation } = row
  const stored = run.manifest as StoredRunManifest
  const workloadManifest = workload.manifest as AnyWorkloadManifest

  const [
    measurementRows,
    artifactRows,
    [supersededBy],
    ranks,
    [link],
    attestations,
  ] = await Promise.all([
    database
      .select()
      .from(schema.measurements)
      .where(eq(schema.measurements.runId, run.id)),
    database
      .select({ artifact: schema.artifacts, link: schema.runArtifacts })
      .from(schema.runArtifacts)
      .innerJoin(
        schema.artifacts,
        eq(schema.runArtifacts.artifactId, schema.artifacts.id),
      )
      .where(eq(schema.runArtifacts.runId, run.id)),
    database
      .select({ id: schema.benchmarkRuns.id })
      .from(schema.benchmarkRuns)
      .where(
        and(
          eq(schema.benchmarkRuns.supersedesId, run.id),
          isNotNull(schema.benchmarkRuns.publishedAt),
        ),
      ),
    cohortRanks([run.comparisonKey]),
    database
      .select({ externalId: schema.sourceLinks.externalId })
      .from(schema.sourceLinks)
      .where(
        and(
          eq(schema.sourceLinks.entityKind, "run"),
          eq(schema.sourceLinks.entityId, run.id),
        ),
      ),
    attestationsFor(run.id),
  ])

  const ineligibleReasons = eligibilityReasons({
    status: run.status,
    published: run.publishedAt !== null,
    retracted: run.retractedAt !== null,
    superseded: supersededBy !== undefined,
    primaryValue: run.primaryValue,
  })
  const eligible = ineligibleReasons.length === 0
  const profile = run.sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  // Ineligible runs never rank; the helper only knows eligible ones anyway.
  const rank = eligible ? (ranks.byRun.get(run.id)?.rank ?? null) : null

  const correctness = stored.run.spec.correctness

  return {
    illustrative: source.kind === "illustrative",
    run: {
      id: run.id,
      digest: run.runDigest,
      status: run.status as RunPageModel["run"]["status"],
      observedAt: run.observedAt.toISOString(),
      publishedAt: run.publishedAt?.toISOString() ?? null,
    },
    evidence: runEvidence(run),
    lifecycle: {
      supersedesId: run.supersedesId,
      supersededById: supersededBy?.id ?? null,
      retracted:
        run.retractedAt !== null
          ? {
              at: run.retractedAt.toISOString(),
              reason:
                typeof run.retractionReason === "string"
                  ? run.retractionReason
                  : JSON.stringify(run.retractionReason ?? "unspecified"),
            }
          : null,
      disputed: null,
      stale: isStale(run.observedAt),
    },
    primary: {
      metric: run.primaryMetric,
      unit: run.primaryUnit ?? "",
      statistic: run.primaryStatistic ?? "value",
      value: run.primaryValue ?? 0,
      sampleCount: run.sampleCount,
      uncertainty:
        run.uncertaintyLow !== null && run.uncertaintyHigh !== null
          ? { low: run.uncertaintyLow, high: run.uncertaintyHigh }
          : null,
    },
    cohort: {
      comparisonKey: run.comparisonKey,
      profile,
      rank,
      eligible,
      ineligibleReasons,
      headRunId: ranks.headByCohort.get(run.comparisonKey) ?? null,
    },
    implementation: {
      name: implementationDisplayName(
        (implementation.manifest as ImplementationRevisionManifest).metadata
          .title,
        operation,
        implementation.slug,
      ),
      slug: implementation.slug,
      revision: implementation.sourceRevision,
    },
    project: { name: project.name, slug: project.slug },
    operation: opRef(operation),
    workload: {
      id: workload.id,
      digest: workload.workloadDigest,
      label: workloadLabel(workloadManifest, workload.dtypes),
      axes:
        workloadManifest.kind === "WorkloadCase"
          ? { ...workloadManifest.spec.axes }
          : {},
      tensors: workloadTensorKeyValues(workloadManifest),
      tolerance: toleranceKeyValues(workloadManifest),
    },
    correctness: correctness
      ? {
          comparator: correctness.comparator,
          maxAbsoluteError: correctness.maximumAbsoluteError ?? null,
          maxRelativeError: correctness.maximumRelativeError ?? null,
          matchedRatio: correctness.matchedRatio ?? null,
          passed: run.status === "passed",
        }
      : null,
    measurements: measurementRows.map((m) => ({
      metric: m.metric,
      statistic: m.statistic,
      value: m.value,
      unit: m.unit,
      sampleCount: m.sampleCount,
    })),
    protocol: protocolKeyValues(stored.protocol),
    environment: environmentKeyValues(stored.environment),
    artifacts: artifactRows.map(({ artifact, link: runArtifact }) => ({
      role: runArtifact.role,
      digest: artifact.contentDigest,
      mediaType: artifact.mediaType,
      sizeBytes: artifact.sizeBytes,
      uri: artifact.uri,
      availability:
        artifact.uri === null
          ? ("unavailable" as const)
          : artifact.storage === "upstream"
            ? ("upstream" as const)
            : ("public" as const),
    })),
    provenance: {
      source: {
        name: source.name,
        kind: source.kind,
        url: sourcePolicy(source.policy).url ?? null,
        license: sourcePolicy(source.policy).license ?? null,
        externalId: link?.externalId ?? null,
        observedAt: run.observedAt.toISOString(),
      },
      externalId: link?.externalId ?? null,
      parserVersion: null,
      snapshotDigest: null,
    },
    sourceNativeMetrics: numericSourceMetrics(
      stored.run.spec.sourceNative?.metrics,
    ),
    attestations,
    manifest: run.manifest,
  }
}

/** Only the numeric source metrics reach the dossier header. */
function numericSourceMetrics(
  metrics: Record<string, unknown> | undefined,
): Record<string, number> | null {
  if (!metrics) return null
  const numeric = Object.fromEntries(
    Object.entries(metrics).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  )
  return Object.keys(numeric).length > 0 ? numeric : null
}
