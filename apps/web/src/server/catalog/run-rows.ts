// Shared row assembly for the catalog read seam (§27.5): the lean joined-run
// projections, the ResultRow constructor every ranked surface uses, and the
// source/implementation summaries built from them. Page readers live in the
// sibling *-reads modules; this file never assembles a whole page model.
import { and, eq, inArray } from "drizzle-orm"
import type {
  ImplementationSummary,
  PrimaryMetric,
  ResultRow,
  SourceRef,
} from "../../lib/catalog-models.ts"
import { dtypeLabel } from "../../lib/format.ts"
import { installIsPinned, pinPipCommand } from "../../lib/install.ts"
import {
  humanizeOperationName,
  implementationDisplayName,
} from "../../lib/names.ts"
import type { ImplementationRevisionManifest } from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import type { RankInput } from "../policy/ranking.ts"
import { bestEvidence, isStale, type RunRow, runEvidence } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"

export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Lean projections for ranked surfaces: scalar columns only, never the JSONB
// manifests, which dominate transfer and parse cost at corpus scale (§16).
// Exported for the sibling read modules, which assemble the same joined-run
// shape with extra operation columns.
export const runColumns = {
  id: schema.benchmarkRuns.id,
  observedAt: schema.benchmarkRuns.observedAt,
  publishedAt: schema.benchmarkRuns.publishedAt,
  comparisonKey: schema.benchmarkRuns.comparisonKey,
  protocolKey: schema.benchmarkRuns.protocolKey,
  environmentKey: schema.benchmarkRuns.environmentKey,
  hardwareModel: schema.benchmarkRuns.hardwareModel,
  hardwareArchitecture: schema.benchmarkRuns.hardwareArchitecture,
  cudaMajor: schema.benchmarkRuns.cudaMajor,
  primaryMetric: schema.benchmarkRuns.primaryMetric,
  primaryValue: schema.benchmarkRuns.primaryValue,
  primaryUnit: schema.benchmarkRuns.primaryUnit,
  primaryStatistic: schema.benchmarkRuns.primaryStatistic,
  sampleCount: schema.benchmarkRuns.sampleCount,
  uncertaintyLow: schema.benchmarkRuns.uncertaintyLow,
  uncertaintyHigh: schema.benchmarkRuns.uncertaintyHigh,
  reproducedByKernelindex: schema.benchmarkRuns.reproducedByKernelindex,
  independentReplicationCount: schema.benchmarkRuns.independentReplicationCount,
  sourceAvailable: schema.benchmarkRuns.sourceAvailable,
  installable: schema.benchmarkRuns.installable,
  licenseExpression: schema.benchmarkRuns.licenseExpression,
  hasRawEvidence: schema.benchmarkRuns.hasRawEvidence,
  sourceNative: schema.benchmarkRuns.sourceNative,
  environmentSummary: schema.benchmarkRuns.environmentSummary,
  solScore: schema.benchmarkRuns.solScore,
  packageVersion: schema.benchmarkRuns.packageVersion,
}
export const implementationColumns = {
  id: schema.implementations.id,
  slug: schema.implementations.slug,
  sourceRevision: schema.implementations.sourceRevision,
  language: schema.implementations.language,
  framework: schema.implementations.framework,
  title: schema.implementations.title,
  installKind: schema.implementations.installKind,
  installCommand: schema.implementations.installCommand,
  licenseDeclared: schema.implementations.licenseDeclared,
  // Live availability facts: the run rows freeze these at insert (§10.4),
  // and a later mirror/license conclusion must show through.
  sourceAvailable: schema.implementations.sourceAvailable,
  installable: schema.implementations.installable,
  licenseExpression: schema.implementations.licenseExpression,
  role: schema.implementations.role,
}
export const projectColumns = {
  name: schema.projects.name,
  slug: schema.projects.slug,
}
export const sourceColumns = {
  slug: schema.sources.slug,
  kind: schema.sources.kind,
  name: schema.sources.name,
}

type ImplementationRow = typeof schema.implementations.$inferSelect
export type WorkloadRow = typeof schema.workloads.$inferSelect

export type JoinedRun = {
  run: Pick<RunRow, keyof typeof runColumns>
  implementation: Pick<ImplementationRow, keyof typeof implementationColumns>
  project: Pick<typeof schema.projects.$inferSelect, "name" | "slug">
  workload: Pick<WorkloadRow, "id" | "dtypes" | "shapeSummary">
  source: Pick<typeof schema.sources.$inferSelect, "slug" | "kind" | "name">
}

/** Operation-scoped rows carry extra workload scalars for matching; the
 * workload manifests are loaded once per operation, never per run. */
export type OperationJoinedRun = JoinedRun & {
  workload: Pick<WorkloadRow, "id" | "dtypes" | "shapeSummary" | "layoutKeys">
}

/** Published eligible runs for one operation — reviewed-equivalent ids ride
 * along so one page presents every definition's cohorts (still separate
 * cohorts) — fastest first. Bounded: the ranked table, sweep, and compatible
 * groups never show more than this, and the tail is reachable through the
 * API's cursor surfaces. */
const OPERATION_RUNS_LIMIT = 600
export async function joinedRunsForOperation(
  operationIds: string[],
): Promise<OperationJoinedRun[]> {
  return db()
    .select({
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        shapeSummary: schema.workloads.shapeSummary,
        layoutKeys: schema.workloads.layoutKeys,
      },
      source: sourceColumns,
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
      schema.sources,
      eq(schema.benchmarkRuns.sourceId, schema.sources.id),
    )
    .where(
      and(
        inArray(schema.workloads.operationId, operationIds),
        eligibleRunFilter(),
      ),
    )
    .orderBy(schema.benchmarkRuns.primaryValue)
    .limit(OPERATION_RUNS_LIMIT)
}

function rowCaveats(joined: JoinedRun): string[] {
  const caveats: string[] = []
  if (joined.source.kind === "illustrative")
    caveats.push("Illustrative example record")
  if (joined.implementation.role === "baseline")
    caveats.push("The source's designated baseline implementation")
  if (!joined.run.reproducedByKernelindex) {
    caveats.push("Reported by source; not independently reproduced")
  }
  if (!joined.implementation.sourceAvailable) caveats.push("No public source")
  if (joined.implementation.licenseExpression === null)
    caveats.push("License unknown")
  return caveats
}

/** Display ref for an operation row: humanized name over the stable slug. */
export function opRef(operation: { name: string; slug: string }) {
  return { name: humanizeOperationName(operation.name), slug: operation.slug }
}

/** The run's primary measurement in its base unit; null when unmeasured. */
export function primaryOf(
  run: Pick<
    RunRow,
    | "primaryMetric"
    | "primaryValue"
    | "primaryUnit"
    | "primaryStatistic"
    | "sampleCount"
    | "uncertaintyLow"
    | "uncertaintyHigh"
  >,
): PrimaryMetric | null {
  if (run.primaryValue === null) return null
  return {
    metric: run.primaryMetric,
    unit: run.primaryUnit ?? "",
    statistic: run.primaryStatistic ?? "value",
    value: run.primaryValue,
    sampleCount: run.sampleCount,
    uncertainty:
      run.uncertaintyLow !== null && run.uncertaintyHigh !== null
        ? { low: run.uncertaintyLow, high: run.uncertaintyHigh }
        : null,
  }
}

export function resultRow(
  joined: JoinedRun,
  operation: { name: string; slug: string },
  extras: Partial<
    Pick<
      ResultRow,
      | "match"
      | "mismatches"
      | "rank"
      | "tiedWithPrevious"
      | "cohortSize"
      | "caveats"
      | "attestations"
    >
  > = {},
): ResultRow {
  const { run, implementation, project, workload } = joined
  // The install line pins to this run's measured version when it carries
  // one (§8.15) — the implementation column pins to the newest measured
  // release, which may postdate the evidence this row states.
  const command =
    implementation.installKind === "pip" &&
    run.packageVersion !== null &&
    implementation.installCommand !== null
      ? pinPipCommand(implementation.installCommand, run.packageVersion)
      : implementation.installCommand
  return {
    runId: run.id,
    implementation: {
      name: implementationDisplayName(
        implementation.title ?? undefined,
        operation,
        implementation.slug,
      ),
      slug: implementation.slug,
    },
    install:
      command !== null && implementation.installKind !== null
        ? {
            kind: implementation.installKind,
            command,
            pinned: installIsPinned(implementation.installKind, command),
          }
        : null,
    project: { name: project.name, slug: project.slug },
    revision: implementation.sourceRevision?.slice(0, 7) ?? null,
    operation: opRef(operation),
    workloadSummary: [dtypeLabel(workload.dtypes), workload.shapeSummary]
      .filter(Boolean)
      .join(" · "),
    hardware: {
      model: run.hardwareModel,
      architecture: run.hardwareArchitecture,
    },
    framework: implementation.framework,
    language: implementation.language,
    primary: primaryOf(run),
    solScore: run.solScore,
    baseline: implementation.role === "baseline",
    evidence: runEvidence(run),
    match: extras.match ?? "exact",
    mismatches: extras.mismatches ?? [],
    rank: extras.rank ?? null,
    tiedWithPrevious: extras.tiedWithPrevious ?? false,
    cohortSize: extras.cohortSize ?? null,
    sourceAvailable: implementation.sourceAvailable,
    installable: implementation.installable,
    license: {
      declared: implementation.licenseDeclared,
      concluded: implementation.licenseExpression,
    },
    lastTestedAt: run.observedAt.toISOString(),
    indexedAt: run.publishedAt?.toISOString() ?? null,
    stale: isStale(run.observedAt),
    disputed: false,
    caveats: [...rowCaveats(joined), ...(extras.caveats ?? [])],
    attestations: extras.attestations ?? 0,
  }
}

export function rankInputOf(joined: JoinedRun): RankInput {
  return {
    id: joined.run.id,
    value: joined.run.primaryValue as number,
    interval:
      joined.run.uncertaintyLow !== null && joined.run.uncertaintyHigh !== null
        ? { low: joined.run.uncertaintyLow, high: joined.run.uncertaintyHigh }
        : null,
    evidence: runEvidence(joined.run),
    observedAt: joined.run.observedAt,
  }
}

export function pageIllustrative(rows: JoinedRun[]): boolean {
  return rows.length > 0 && rows.every((j) => j.source.kind === "illustrative")
}

/** Implementations (with their project) declared for one operation and its
 * reviewed equivalents. */
export async function implementationRows(operationIds: string[]) {
  return db()
    .select({
      implementation: schema.implementations,
      project: schema.projects,
    })
    .from(schema.implementations)
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .where(inArray(schema.implementations.operationId, operationIds))
}

export type ImplementationRows = Awaited<ReturnType<typeof implementationRows>>

/** Implementations declaring support for the operation but with no run. */
export function supportedUnmeasuredRows(
  operation: { name: string; slug: string },
  joined: JoinedRun[],
  rows: ImplementationRows,
): ResultRow[] {
  const measured = new Set(joined.map((j) => j.implementation.id))
  return rows
    .filter((row) => !measured.has(row.implementation.id))
    .map(({ implementation, project }) => {
      const manifest = implementation.manifest as ImplementationRevisionManifest
      const variant = manifest.spec.buildVariants?.[0]
      return {
        runId: null,
        implementation: {
          name: implementationDisplayName(
            manifest.metadata.title,
            operation,
            implementation.slug,
          ),
          slug: implementation.slug,
        },
        install: variant?.install.command
          ? {
              kind: variant.install.kind,
              command: variant.install.command,
              pinned: installIsPinned(
                variant.install.kind,
                variant.install.command,
              ),
            }
          : null,
        project: { name: project.name, slug: project.slug },
        revision: implementation.sourceRevision?.slice(0, 7) ?? null,
        operation: opRef(operation),
        workloadSummary: manifest.spec.support.dtypes.join("/"),
        hardware: {
          model:
            manifest.spec.support.productsTested?.[0] ??
            "declared support only",
          architecture: implementation.targetArchitectures[0] ?? null,
        },
        framework: implementation.framework,
        language: implementation.language,
        primary: null,
        solScore: null,
        baseline: implementation.role === "baseline",
        evidence: null,
        match: "supported_unobserved" as const,
        mismatches: [],
        rank: null,
        tiedWithPrevious: false,
        cohortSize: null,
        sourceAvailable: implementation.sourceAvailable,
        installable: implementation.installable,
        license: {
          declared: manifest.spec.licensing.declared ?? null,
          concluded: implementation.licenseExpression,
        },
        lastTestedAt: null,
        indexedAt: null,
        stale: false,
        disputed: false,
        caveats: ["Declared support only; no measurement for this workload"],
        attestations: 0,
      }
    })
}

export function implementationSummaries(
  rows: ImplementationRows,
  joined: JoinedRun[],
  operation: { name: string; slug: string },
): ImplementationSummary[] {
  return rows.map(({ implementation, project }) => {
    const own = joined.filter((j) => j.implementation.id === implementation.id)
    const best = own[0]
    const manifest = implementation.manifest as ImplementationRevisionManifest
    return {
      slug: implementation.slug,
      name: implementationDisplayName(
        manifest.metadata.title,
        operation,
        implementation.slug,
      ),
      project: { name: project.name, slug: project.slug },
      language: implementation.language,
      framework: implementation.framework,
      // The row speaks for the implementation: strongest run, not fastest.
      evidence: bestEvidence(own.map((j) => j.run)),
      bestPrimary: best
        ? resultRow(best, { name: "", slug: "" }).primary
        : null,
      sourceAvailable: implementation.sourceAvailable,
      installable: implementation.installable,
      license: {
        declared: manifest.spec.licensing.declared ?? null,
        concluded: implementation.licenseExpression,
      },
    }
  })
}

/** The per-source ingestion policy jsonb (§14.10), defensively read. */
export type SourcePolicy = {
  license?: string
  attribution?: string
  url?: string
}
export function sourcePolicy(policy: unknown): SourcePolicy {
  return policy !== null && typeof policy === "object"
    ? (policy as SourcePolicy)
    : {}
}

/** Distinct sources behind a row set, with their attribution link and
 * license from sources.policy — a display condition of the upstream terms. */
export async function sourceRefs(joined: JoinedRun[]): Promise<SourceRef[]> {
  const bySlug = new Map<string, SourceRef>()
  for (const j of joined) {
    const last = bySlug.get(j.source.slug)
    const observedAt = j.run.observedAt.toISOString()
    if (!last || (last.observedAt !== null && last.observedAt < observedAt)) {
      bySlug.set(j.source.slug, {
        name: j.source.name,
        kind: j.source.kind,
        url: null,
        license: null,
        externalId: null,
        observedAt,
      })
    }
  }
  if (bySlug.size === 0) return []
  const rows = await db()
    .select({ slug: schema.sources.slug, policy: schema.sources.policy })
    .from(schema.sources)
    .where(inArray(schema.sources.slug, [...bySlug.keys()]))
  for (const row of rows) {
    const ref = bySlug.get(row.slug)
    const policy = sourcePolicy(row.policy)
    if (ref) {
      ref.url = policy.url ?? null
      ref.license = policy.license ?? null
    }
  }
  return [...bySlug.values()]
}

/** Highlight grammar for a mirrored source file. Importers are inconsistent
 * about media types (FlashInfer stores C++/CUDA as text/plain), so the file
 * extension decides whenever the media type is unhelpful. */
export function sourceLanguage(
  mediaType: string,
  fileName: string | null,
): "python" | "cpp" | "text" {
  if (mediaType === "text/x-python" || fileName?.endsWith(".py"))
    return "python"
  if (
    mediaType === "text/x-cuda" ||
    /\.(cu|cuh|cpp|cc|cxx|c|h|hpp)$/.test(fileName ?? "")
  )
    return "cpp"
  return "text"
}
