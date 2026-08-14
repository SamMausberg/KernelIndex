// PostgreSQL-backed implementations of the catalog read seam (§27.5),
// returning the same page models as the fixtures. Only published, passed,
// unretracted runs appear in result tables; the run page itself shows any
// published run including failed, superseded, and retracted evidence.
import {
  and,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
} from "drizzle-orm"
import type {
  CohortContext,
  HomePageModel,
  ImplementationPageModel,
  ImplementationSummary,
  Mismatch,
  OperationPageModel,
  ResultRow,
  RunPageModel,
  SearchInput,
  SearchPageModel,
  SourceRef,
} from "../../lib/catalog-models.ts"
import type {
  ImplementationRevisionManifest,
  OperationSpecManifest,
} from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  type AnyWorkloadManifest,
  environmentKeyValues,
  isStale,
  operationAxisSpecs,
  operationTensorBindings,
  protocolKeyValues,
  type RunRow,
  runEvidence,
  type StoredRunManifest,
  toleranceKeyValues,
  toleranceSummary,
  workloadLabel,
  workloadTensorKeyValues,
} from "./present.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type JoinedRun = {
  run: RunRow
  implementation: typeof schema.implementations.$inferSelect
  project: typeof schema.projects.$inferSelect
  workload: typeof schema.workloads.$inferSelect
  source: typeof schema.sources.$inferSelect
}

/** Published, passed, unretracted runs for one operation, fastest first. */
async function joinedRunsForOperation(
  operationId: string,
): Promise<JoinedRun[]> {
  return db()
    .select({
      run: schema.benchmarkRuns,
      implementation: schema.implementations,
      project: schema.projects,
      workload: schema.workloads,
      source: schema.sources,
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
        eq(schema.workloads.operationId, operationId),
        eq(schema.benchmarkRuns.status, "passed"),
        isNotNull(schema.benchmarkRuns.publishedAt),
        isNull(schema.benchmarkRuns.retractedAt),
        isNull(schema.benchmarkRuns.supersedesId),
      ),
    )
    .orderBy(schema.benchmarkRuns.primaryValue)
}

function rowCaveats(joined: JoinedRun): string[] {
  const caveats: string[] = []
  if (joined.source.kind === "illustrative")
    caveats.push("Illustrative example record")
  if (!joined.run.reproducedByKernelindex) {
    caveats.push("Reported by source; not independently reproduced")
  }
  if (!joined.run.sourceAvailable) caveats.push("No public source")
  if (joined.run.licenseExpression === null) caveats.push("License unknown")
  return caveats
}

function resultRow(
  joined: JoinedRun,
  operation: { name: string; slug: string },
  extras: Partial<
    Pick<ResultRow, "match" | "mismatches" | "rank" | "caveats">
  > = {},
): ResultRow {
  const { run, implementation, project, workload } = joined
  const stored = run.manifest as StoredRunManifest
  return {
    runId: run.id,
    implementation: { name: implementation.slug, slug: implementation.slug },
    project: { name: project.name, slug: project.slug },
    revision: implementation.sourceRevision?.slice(0, 7) ?? null,
    operation,
    workloadSummary: `${workload.dtypes.join("/")} · ${workload.shapeSummary}`,
    hardware: {
      model: run.hardwareModel,
      architecture: run.hardwareArchitecture,
    },
    framework: implementation.framework,
    language: implementation.language,
    primary:
      run.primaryValue !== null
        ? {
            metric: run.primaryMetric,
            unit: run.primaryUnit ?? "",
            statistic: stored.run.spec.timing?.primaryStatistic ?? "value",
            value: run.primaryValue,
            sampleCount: run.sampleCount,
            uncertainty:
              run.uncertaintyLow !== null && run.uncertaintyHigh !== null
                ? { low: run.uncertaintyLow, high: run.uncertaintyHigh }
                : null,
          }
        : null,
    evidence: runEvidence(run),
    match: extras.match ?? "exact",
    mismatches: extras.mismatches ?? [],
    rank: extras.rank ?? null,
    tiedWithPrevious: false,
    sourceAvailable: run.sourceAvailable,
    installable: run.installable,
    license: {
      declared:
        (implementation.manifest as ImplementationRevisionManifest).spec
          .licensing.declared ?? null,
      concluded: run.licenseExpression,
    },
    lastTestedAt: run.observedAt.toISOString(),
    stale: isStale(run.observedAt),
    disputed: false,
    caveats: [...rowCaveats(joined), ...(extras.caveats ?? [])],
  }
}

function axisMismatches(
  requested: AnyWorkloadManifest,
  observed: AnyWorkloadManifest,
): Mismatch[] {
  if (requested.kind === "WorkloadSuite" || observed.kind === "WorkloadSuite") {
    return [
      {
        field: "workloadScope",
        requested:
          requested.kind === "WorkloadSuite" ? "suite aggregate" : "exact case",
        observed:
          observed.kind === "WorkloadSuite" ? "suite aggregate" : "exact case",
      },
    ]
  }
  const mismatches: Mismatch[] = []
  const names = new Set([
    ...Object.keys(requested.spec.axes),
    ...Object.keys(observed.spec.axes),
  ])
  for (const name of names) {
    const want = requested.spec.axes[name]
    const got = observed.spec.axes[name]
    if (want !== got) {
      mismatches.push({
        field: `axes.${name}`,
        requested: String(want),
        observed: String(got),
      })
    }
  }
  return mismatches
}

/**
 * Group one operation's runs for a selected workload: the largest same-key
 * comparison cohort is the ranked table; same-workload runs outside it are
 * listed separately; other workloads' runs become compatible matches with an
 * explicit mismatch vector (§16.6, §11.1).
 */
function groupRuns(
  joined: JoinedRun[],
  operation: { name: string; slug: string },
  selectedWorkloadId: string,
) {
  const selected = joined.filter((j) => j.workload.id === selectedWorkloadId)
  const byCohort = new Map<string, JoinedRun[]>()
  for (const j of selected) {
    byCohort.set(j.run.comparisonKey, [
      ...(byCohort.get(j.run.comparisonKey) ?? []),
      j,
    ])
  }
  const primaryCohort =
    [...byCohort.values()].sort((a, b) => b.length - a.length)[0] ?? []
  const cohortKey = primaryCohort[0]?.run.comparisonKey ?? null

  const selectedManifest = selected[0]?.workload.manifest as
    | AnyWorkloadManifest
    | undefined
  const exact = primaryCohort.map((j, index) =>
    resultRow(j, operation, { rank: index + 1 }),
  )
  const reported = selected
    .filter((j) => j.run.comparisonKey !== cohortKey)
    .map((j) =>
      resultRow(j, operation, {
        caveats: [
          "Different comparison cohort: protocol or environment differs",
        ],
      }),
    )
  const compatible = joined
    .filter((j) => j.workload.id !== selectedWorkloadId)
    .map((j) =>
      resultRow(j, operation, {
        match: "compatible",
        mismatches: selectedManifest
          ? axisMismatches(
              selectedManifest,
              j.workload.manifest as AnyWorkloadManifest,
            )
          : [],
      }),
    )

  const sourceNative = primaryCohort.some(
    (j) =>
      (j.run.manifest as StoredRunManifest).run.spec.sourceNative !== undefined,
  )
  const cohort: CohortContext | null = cohortKey
    ? {
        comparisonKey: cohortKey,
        profile: sourceNative ? "source_native" : "strict_exact",
        description: sourceNative
          ? "Source-native cohort: identical workload, protocol, and environment under the upstream harness. Ordered by primary metric; statistical tie policy arrives with ranking v1."
          : "Identical workload, protocol, environment, and correctness policy. Ordered by primary metric; statistical tie policy arrives with ranking v1.",
      }
    : null

  return { exact, reported, compatible, cohort }
}

const escapeLike = (token: string) => token.replaceAll(/[\\%_]/g, "\\$&")

/**
 * Tiered operation resolution mirroring the §12.4 relevance order: exact
 * slug, then exact alias, then family, then name substring. Deterministic —
 * a weaker tier never outranks a stronger one.
 */
async function findOperation(query: string) {
  const database = db()
  const tokens = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter((token) => /^[a-z0-9_-]{2,}$/.test(token))
  if (tokens.length === 0) return null

  const bySlug = await database
    .select()
    .from(schema.operations)
    .where(inArray(schema.operations.slug, tokens))
    .limit(1)
  if (bySlug[0]) return bySlug[0]

  const aliasHits = await database
    .select({ operationId: schema.operationAliases.operationId })
    .from(schema.operationAliases)
    .where(inArray(schema.operationAliases.alias, tokens))
  if (aliasHits.length > 0) {
    const [operation] = await database
      .select()
      .from(schema.operations)
      .where(
        inArray(
          schema.operations.id,
          aliasHits.map((hit) => hit.operationId),
        ),
      )
      .orderBy(schema.operations.createdAt)
      .limit(1)
    if (operation) return operation
  }

  const [byFamily] = await database
    .select()
    .from(schema.operations)
    .where(inArray(schema.operations.family, tokens))
    .orderBy(schema.operations.createdAt)
    .limit(1)
  if (byFamily) return byFamily

  const [byName] = await database
    .select()
    .from(schema.operations)
    .where(
      or(
        ...tokens.map((token) =>
          ilike(schema.operations.name, `%${escapeLike(token)}%`),
        ),
      ),
    )
    .orderBy(schema.operations.createdAt)
    .limit(1)
  return byName ?? null
}

/** Pick the workload with the most runs as the default selection. */
function defaultWorkloadId(
  joined: JoinedRun[],
  workloadIds: string[],
): string | null {
  const countById = new Map<string, number>()
  for (const j of joined)
    countById.set(j.workload.id, (countById.get(j.workload.id) ?? 0) + 1)
  const best = [...countById.entries()].sort((a, b) => b[1] - a[1])[0]
  return best?.[0] ?? workloadIds[0] ?? null
}

function pageIllustrative(rows: JoinedRun[]): boolean {
  return rows.length > 0 && rows.every((j) => j.source.kind === "illustrative")
}

/** §16.5: most recent published records across all operations, newest first. */
export async function getHomePage(): Promise<HomePageModel> {
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
        eq(schema.benchmarkRuns.status, "passed"),
        isNotNull(schema.benchmarkRuns.publishedAt),
        isNull(schema.benchmarkRuns.retractedAt),
        isNull(schema.benchmarkRuns.supersedesId),
      ),
    )
    .orderBy(desc(schema.benchmarkRuns.observedAt))
    .limit(8)
  return {
    illustrative: pageIllustrative(rows),
    latest: rows.map((j) =>
      resultRow(j, { name: j.operation.name, slug: j.operation.slug }),
    ),
  }
}

export async function searchCatalog(
  input: SearchInput,
): Promise<SearchPageModel> {
  const query = input.query.trim()
  const base: Omit<SearchPageModel, "noResult"> = {
    illustrative: false,
    query,
    interpretedQuery:
      query === "" ? "Empty query" : `Operation search for “${query}”`,
    cohort: null,
    groups: {
      exact: [],
      compatible: [],
      supportedUnmeasured: [],
      reported: [],
    },
    related: [],
  }
  const operation = query === "" ? null : await findOperation(query)
  if (!operation) {
    return {
      ...base,
      noResult: {
        guidance:
          "No matching operation found. Search by operation name, family, or alias — shape, dtype, and hardware filters arrive with the full query parser.",
        suggestions: ["rmsnorm", "gemm", "attention"],
      },
    }
  }

  const joined = await joinedRunsForOperation(operation.id)
  const workloadIds = [...new Set(joined.map((j) => j.workload.id))]
  const selectedWorkloadId = defaultWorkloadId(joined, workloadIds)
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        selectedWorkloadId,
      )
    : { exact: [], reported: [], compatible: [], cohort: null }

  const related = await db()
    .select()
    .from(schema.operations)
    .where(and(eq(schema.operations.family, operation.family)))
    .limit(6)

  return {
    ...base,
    illustrative: pageIllustrative(joined),
    interpretedQuery: `Operation ${operation.name}`,
    cohort: groups.cohort,
    groups: {
      exact: groups.exact,
      compatible: groups.compatible,
      supportedUnmeasured: await supportedUnmeasuredRows(operation, joined),
      reported: groups.reported,
    },
    related: related
      .filter((op) => op.id !== operation.id)
      .map((op) => ({
        kind: "operation" as const,
        name: op.name,
        slug: op.slug,
        summary: `Operation in the ${op.family} family`,
      })),
    noResult: null,
  }
}

/** Implementations declaring support for the operation but with no run. */
async function supportedUnmeasuredRows(
  operation: typeof schema.operations.$inferSelect,
  joined: JoinedRun[],
): Promise<ResultRow[]> {
  const measured = new Set(joined.map((j) => j.implementation.id))
  const rows = await db()
    .select({
      implementation: schema.implementations,
      project: schema.projects,
    })
    .from(schema.implementations)
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .where(eq(schema.implementations.operationId, operation.id))
  return rows
    .filter((row) => !measured.has(row.implementation.id))
    .map(({ implementation, project }) => {
      const manifest = implementation.manifest as ImplementationRevisionManifest
      return {
        runId: null,
        implementation: {
          name: implementation.slug,
          slug: implementation.slug,
        },
        project: { name: project.name, slug: project.slug },
        revision: implementation.sourceRevision?.slice(0, 7) ?? null,
        operation: { name: operation.name, slug: operation.slug },
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
        evidence: null,
        match: "supported_unobserved" as const,
        mismatches: [],
        rank: null,
        tiedWithPrevious: false,
        sourceAvailable: implementation.sourceAvailable,
        installable: implementation.installable,
        license: {
          declared: manifest.spec.licensing.declared ?? null,
          concluded: implementation.licenseExpression,
        },
        lastTestedAt: null,
        stale: false,
        disputed: false,
        caveats: ["Declared support only; no measurement for this workload"],
      }
    })
}

export async function getOperationPage(
  slug: string,
  options?: { workload?: string },
): Promise<OperationPageModel | null> {
  const database = db()
  const [operation] = await database
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.slug, slug))
  if (!operation) return null
  const manifest = operation.manifest as OperationSpecManifest

  const workloadRows = await database
    .select()
    .from(schema.workloads)
    .where(eq(schema.workloads.operationId, operation.id))
  const aliases = await database
    .select({ alias: schema.operationAliases.alias })
    .from(schema.operationAliases)
    .where(eq(schema.operationAliases.operationId, operation.id))

  const joined = await joinedRunsForOperation(operation.id)
  const requestedWorkload = workloadRows.find(
    (w) => w.id === options?.workload || w.workloadDigest === options?.workload,
  )
  const selectedWorkloadId =
    requestedWorkload?.id ??
    defaultWorkloadId(
      joined,
      workloadRows.map((w) => w.id),
    )
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        selectedWorkloadId,
      )
    : { exact: [], reported: [], compatible: [], cohort: null }

  const implementations = await implementationSummaries(operation.id, joined)
  const evidence = joined.map((j) => runEvidence(j.run))

  return {
    illustrative: pageIllustrative(joined),
    operation: {
      id: operation.id,
      slug: operation.slug,
      name: operation.name,
      family: operation.family,
      aliases: aliases.map((row) => row.alias),
      semanticDigest: operation.semanticDigest,
      summary:
        manifest.metadata.description ??
        manifest.spec.semantics.expression ??
        "",
      supersededById: null,
    },
    semantics: {
      inputs: operationTensorBindings(manifest.spec.inputs),
      outputs: operationTensorBindings(manifest.spec.outputs),
      axes: operationAxisSpecs(manifest),
      expression: manifest.spec.semantics.expression ?? null,
      determinism: manifest.spec.semantics.determinism,
      constraints:
        manifest.spec.semantics.mutation === "none"
          ? ["No mutation or aliasing"]
          : [],
    },
    workloads: workloadRows.map((row) => {
      const workloadManifest = row.manifest as AnyWorkloadManifest
      return {
        id: row.id,
        digest: row.workloadDigest,
        label: workloadLabel(workloadManifest, row.dtypes),
        axes:
          workloadManifest.kind === "WorkloadCase"
            ? { ...workloadManifest.spec.axes }
            : {},
        toleranceSummary: toleranceSummary(workloadManifest),
      }
    }),
    selectedWorkloadId,
    cohort: groups.cohort,
    records: groups.exact,
    implementations,
    coverage: {
      verified: evidence.filter(
        (level) => level === "verified" || level === "replicated",
      ).length,
      reproducible: evidence.filter((level) => level === "reproducible").length,
      reported: evidence.filter((level) => level === "reported").length,
      lastObservedAt:
        joined.length > 0
          ? new Date(
              Math.max(...joined.map((j) => j.run.observedAt.getTime())),
            ).toISOString()
          : null,
    },
    sources: sourceRefs(joined),
  }
}

function sourceRefs(joined: JoinedRun[]): SourceRef[] {
  const bySlug = new Map<string, SourceRef>()
  for (const j of joined) {
    const last = bySlug.get(j.source.slug)
    const observedAt = j.run.observedAt.toISOString()
    if (!last || (last.observedAt !== null && last.observedAt < observedAt)) {
      bySlug.set(j.source.slug, {
        name: j.source.name,
        kind: j.source.kind,
        url: null,
        externalId: null,
        observedAt,
      })
    }
  }
  return [...bySlug.values()]
}

async function implementationSummaries(
  operationId: string,
  joined: JoinedRun[],
): Promise<ImplementationSummary[]> {
  const rows = await db()
    .select({
      implementation: schema.implementations,
      project: schema.projects,
    })
    .from(schema.implementations)
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .where(eq(schema.implementations.operationId, operationId))
  return rows.map(({ implementation, project }) => {
    const best = joined.find((j) => j.implementation.id === implementation.id)
    const manifest = implementation.manifest as ImplementationRevisionManifest
    return {
      slug: implementation.slug,
      name: implementation.slug,
      project: { name: project.name, slug: project.slug },
      language: implementation.language,
      framework: implementation.framework,
      evidence: best ? runEvidence(best.run) : null,
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

export async function getImplementationPage(
  slug: string,
): Promise<ImplementationPageModel | null> {
  const database = db()
  const [row] = await database
    .select({
      implementation: schema.implementations,
      project: schema.projects,
      operation: schema.operations,
    })
    .from(schema.implementations)
    .innerJoin(
      schema.projects,
      eq(schema.implementations.projectId, schema.projects.id),
    )
    .innerJoin(
      schema.operations,
      eq(schema.implementations.operationId, schema.operations.id),
    )
    .where(eq(schema.implementations.slug, slug))
    .orderBy(desc(schema.implementations.createdAt))
    .limit(1)
  if (!row) return null
  const { implementation, project, operation } = row
  const manifest = implementation.manifest as ImplementationRevisionManifest

  const joined = (await joinedRunsForOperation(operation.id)).filter(
    (j) => j.implementation.id === implementation.id,
  )
  const bestResults = joined.map((j) =>
    resultRow(j, { name: operation.name, slug: operation.slug }),
  )
  const variant = manifest.spec.buildVariants?.[0]
  const evidence = joined.length > 0 ? runEvidence(joined[0].run) : null

  return {
    illustrative: pageIllustrative(joined),
    implementation: {
      id: implementation.id,
      slug: implementation.slug,
      name: implementation.slug,
      digest: implementation.implementationDigest,
      revision: implementation.sourceRevision,
      supersededById: null,
    },
    project: {
      name: project.name,
      slug: project.slug,
      repositoryUrl: project.canonicalUrl,
    },
    usage: {
      install: variant?.install.command
        ? { kind: variant.install.kind, command: variant.install.command }
        : null,
      invocationExample: null,
      requirements: Object.entries(variant?.requirements ?? {}).map(
        ([name, constraint]) => ({
          name,
          constraint,
        }),
      ),
    },
    interface: {
      language: manifest.spec.callable.language,
      framework: manifest.spec.callable.interface ?? null,
      symbol: manifest.spec.callable.symbol ?? null,
      sourcePath: manifest.spec.callable.path ?? null,
    },
    support: {
      hardware: manifest.spec.support.productsTested ?? [],
      architectures: manifest.spec.support.hardwareArchitectures,
      dtypes: manifest.spec.support.dtypes,
      layouts: manifest.spec.support.layouts ?? [],
      axes: manifest.spec.support.axes ?? [],
    },
    source: {
      available: implementation.sourceAvailable,
      url: manifest.spec.projectRevision.repository ?? null,
      commit: manifest.spec.projectRevision.commit ?? null,
      treeDigest: manifest.spec.projectRevision.treeDigest ?? null,
    },
    license: {
      declared: manifest.spec.licensing.declared ?? null,
      concluded: implementation.licenseExpression,
      evidencePath: manifest.spec.licensing.evidence?.path ?? null,
    },
    trust: {
      evidence,
      summary: evidence
        ? `Best evidence level for this revision: ${evidence}`
        : "No published measurement for this revision",
    },
    bestResults,
    limitations: manifest.spec.support.axes ?? [],
    provenance: {
      source: null,
      authors: (manifest.metadata.authors ?? [])
        .map((author) => author.github ?? author.name)
        .filter((author): author is string => author !== undefined),
      importedAt: implementation.createdAt.toISOString(),
    },
  }
}

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

  const measurementRows = await database
    .select()
    .from(schema.measurements)
    .where(eq(schema.measurements.runId, run.id))
  const artifactRows = await database
    .select({ artifact: schema.artifacts, link: schema.runArtifacts })
    .from(schema.runArtifacts)
    .innerJoin(
      schema.artifacts,
      eq(schema.runArtifacts.artifactId, schema.artifacts.id),
    )
    .where(eq(schema.runArtifacts.runId, run.id))
  const [supersededBy] = await database
    .select({ id: schema.benchmarkRuns.id })
    .from(schema.benchmarkRuns)
    .where(eq(schema.benchmarkRuns.supersedesId, run.id))
  const cohortRuns = await database
    .select({
      id: schema.benchmarkRuns.id,
      primaryValue: schema.benchmarkRuns.primaryValue,
    })
    .from(schema.benchmarkRuns)
    .where(
      and(
        eq(schema.benchmarkRuns.comparisonKey, run.comparisonKey),
        eq(schema.benchmarkRuns.status, "passed"),
        isNotNull(schema.benchmarkRuns.publishedAt),
        isNull(schema.benchmarkRuns.retractedAt),
        isNull(schema.benchmarkRuns.supersedesId),
      ),
    )
  const [link] = await database
    .select({ externalId: schema.sourceLinks.externalId })
    .from(schema.sourceLinks)
    .where(
      and(
        eq(schema.sourceLinks.entityKind, "run"),
        eq(schema.sourceLinks.entityId, run.id),
      ),
    )

  const eligible =
    run.status === "passed" &&
    run.retractedAt === null &&
    supersededBy === undefined
  const ineligibleReasons = [
    ...(run.status !== "passed" ? [`STATUS_${run.status.toUpperCase()}`] : []),
    ...(run.retractedAt !== null ? ["RETRACTED"] : []),
    ...(supersededBy !== undefined ? ["SUPERSEDED"] : []),
  ]
  const rank =
    eligible && run.primaryValue !== null
      ? cohortRuns.filter(
          (candidate) =>
            candidate.primaryValue !== null &&
            candidate.primaryValue < (run.primaryValue as number),
        ).length + 1
      : null

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
              reason: JSON.stringify(run.retractionReason ?? "unspecified"),
            }
          : null,
      disputed: null,
      stale: isStale(run.observedAt),
    },
    primary: {
      metric: run.primaryMetric,
      unit: run.primaryUnit ?? "",
      statistic: stored.run.spec.timing?.primaryStatistic ?? "value",
      value: run.primaryValue ?? 0,
      sampleCount: run.sampleCount,
      uncertainty:
        run.uncertaintyLow !== null && run.uncertaintyHigh !== null
          ? { low: run.uncertaintyLow, high: run.uncertaintyHigh }
          : null,
    },
    cohort: {
      comparisonKey: run.comparisonKey,
      profile:
        stored.run.spec.sourceNative !== undefined
          ? "source_native"
          : "strict_exact",
      rank,
      eligible,
      ineligibleReasons,
    },
    implementation: {
      name: implementation.slug,
      slug: implementation.slug,
      revision: implementation.sourceRevision,
    },
    project: { name: project.name, slug: project.slug },
    operation: { name: operation.name, slug: operation.slug },
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
        url: null,
        externalId: link?.externalId ?? null,
        observedAt: run.observedAt.toISOString(),
      },
      externalId: link?.externalId ?? null,
      parserVersion: null,
      snapshotDigest: null,
    },
    manifest: run.manifest,
  }
}
