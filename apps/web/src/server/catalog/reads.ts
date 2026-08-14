// PostgreSQL-backed implementations of the catalog read seam (§27.5),
// returning the same page models as the fixtures. Only published, passed,
// unretracted runs appear in result tables; the run page itself shows any
// published run including failed, superseded, and retracted evidence.
import { and, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import type {
  CohortContext,
  HomePageModel,
  ImplementationPageModel,
  ImplementationSummary,
  KeyValue,
  Mismatch,
  OperationPageModel,
  RecordEvent,
  RecordHolder,
  RecordsPageModel,
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
  const variant = (implementation.manifest as ImplementationRevisionManifest)
    .spec.buildVariants?.[0]
  return {
    runId: run.id,
    implementation: { name: implementation.slug, slug: implementation.slug },
    install: variant?.install.command
      ? { kind: variant.install.kind, command: variant.install.command }
      : null,
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
        facts: cohortFacts(primaryCohort[0]),
      }
    : null

  return { exact, reported, compatible, cohort }
}

/** Facts every row in the cohort shares (§16.6) — rendered once, not per row. */
function cohortFacts(joined: JoinedRun): KeyValue[] {
  const stored = joined.run.manifest as StoredRunManifest
  const { hardware, software } = stored.environment.spec
  const measurement = stored.protocol.spec.measurement
  const framework = software.framework
    ? `${software.framework.name} ${software.framework.version}`
    : null
  const protocol = [
    `${stored.protocol.spec.harness.name}${stored.protocol.spec.harness.version ? ` ${stored.protocol.spec.harness.version}` : ""}`,
    measurement.samples
      ? `${measurement.primaryStatistic} of ${measurement.samples}`
      : measurement.primaryStatistic,
    measurement.compileIncluded === false ? "compile excluded" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const workloadManifest = joined.workload.manifest as AnyWorkloadManifest
  const entries: [string, string | null | undefined][] = [
    ["GPU", hardware.product],
    ["Workload", workloadLabel(workloadManifest, joined.workload.dtypes)],
    ["CUDA", software.cudaToolkit],
    ["Driver", software.driver],
    ["Framework", framework],
    ["Protocol", protocol],
  ]
  return entries
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([key, value]) => ({ key, value }))
}

/** Intent words that never identify an operation. */
const SEARCH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "kernel",
  "kernels",
  "gpu",
  "fastest",
  "best",
  "implementation",
  "operation",
])

/**
 * Tiered operation resolution mirroring the §12.4 relevance order: exact
 * slug, then exact alias, then exact family, then substring matches over
 * slug/family/name scored by how many query tokens they satisfy. Matching is
 * hyphen/underscore-insensitive, so "rmsnorm" also finds "069-rms-norm".
 * Facet tokens (key=value, shapes, short hardware/dtype codes) never
 * misresolve the operation — they score zero until the Week 3 parser turns
 * them into real filters. The corpus is small pre-Week-3; FTS and trigram
 * search replace the in-memory scan in §22.4.
 */
async function findOperation(query: string) {
  const database = db()
  const tokens = [
    ...new Set(
      query
        .toLowerCase()
        .split(/[\s,]+/)
        .filter((token) => /^[a-z][a-z0-9_-]{2,}$/.test(token))
        .filter((token) => !SEARCH_STOPWORDS.has(token)),
    ),
  ]
  if (tokens.length === 0) return null

  const operations = await database.select().from(schema.operations)
  const byAge = (
    a: (typeof operations)[number],
    b: (typeof operations)[number],
  ) => a.createdAt.getTime() - b.createdAt.getTime()

  const bySlug = operations
    .filter((op) => tokens.includes(op.slug))
    .sort(byAge)[0]
  if (bySlug) return bySlug

  const aliasHits = await database
    .select({ operationId: schema.operationAliases.operationId })
    .from(schema.operationAliases)
    .where(inArray(schema.operationAliases.alias, tokens))
  const aliasIds = new Set(aliasHits.map((hit) => hit.operationId))
  const byAlias = operations.filter((op) => aliasIds.has(op.id)).sort(byAge)[0]
  if (byAlias) return byAlias

  const byFamily = operations
    .filter((op) => tokens.includes(op.family))
    .sort(byAge)[0]
  if (byFamily) return byFamily

  const collapse = (value: string) =>
    value.toLowerCase().replaceAll(/[-_]/g, "")
  const scored = operations
    .map((op) => {
      const haystack = `${op.slug} ${op.family} ${op.name}`.toLowerCase()
      const collapsed = collapse(haystack)
      const score = tokens.filter(
        (token) =>
          haystack.includes(token) || collapsed.includes(collapse(token)),
      ).length
      return { op, score }
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || byAge(a.op, b.op))
  return scored[0]?.op ?? null
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
  const database = db()
  const [operations, implementations, runs, sources] = await Promise.all([
    database.select({ n: count() }).from(schema.operations),
    database.select({ n: count() }).from(schema.implementations),
    database
      .select({ n: count() })
      .from(schema.benchmarkRuns)
      .where(isNotNull(schema.benchmarkRuns.publishedAt)),
    database.select({ n: count() }).from(schema.sources),
  ])
  return {
    illustrative: pageIllustrative(rows),
    latest: rows.map((j) =>
      resultRow(j, { name: j.operation.name, slug: j.operation.slug }),
    ),
    counts: {
      operations: operations[0].n,
      implementations: implementations[0].n,
      runs: runs[0].n,
      sources: sources[0].n,
    },
  }
}

/**
 * §16.12: derive the record ledger from append-only runs. Within one
 * comparison cohort, the record sequence is the running minimum of the
 * primary metric in observation order; nothing is stored, so corrections
 * and retractions automatically recompute history.
 */
export async function getRecordsPage(): Promise<RecordsPageModel> {
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
        isNotNull(schema.benchmarkRuns.primaryValue),
        isNull(schema.benchmarkRuns.retractedAt),
        isNull(schema.benchmarkRuns.supersedesId),
      ),
    )
    .orderBy(schema.benchmarkRuns.observedAt)

  const byCohort = new Map<string, typeof rows>()
  for (const row of rows) {
    byCohort.set(row.run.comparisonKey, [
      ...(byCohort.get(row.run.comparisonKey) ?? []),
      row,
    ])
  }

  const records: RecordHolder[] = []
  const holderRows: (typeof rows)[number][] = []
  for (const [cohortKey, cohortRows] of byCohort) {
    const events: RecordEvent[] = []
    let bestRow: (typeof rows)[number] | null = null
    for (const row of cohortRows) {
      const value = row.run.primaryValue as number
      if (bestRow !== null && value >= (bestRow.run.primaryValue as number))
        continue
      const operation = {
        name: row.operation.name,
        slug: row.operation.slug,
      }
      const previous = bestRow ? resultRow(bestRow, operation).primary : null
      const current = resultRow(row, operation)
      events.unshift({
        at: row.run.observedAt.toISOString(),
        runId: row.run.id,
        implementation: current.implementation,
        value: current.primary as RecordEvent["value"],
        previousValue: previous,
        improvementPct: previous
          ? ((previous.value - value) / previous.value) * 100
          : null,
      })
      bestRow = row
    }
    if (bestRow === null) continue
    holderRows.push(bestRow)
    const stored = bestRow.run.manifest as StoredRunManifest
    const operation = {
      name: bestRow.operation.name,
      slug: bestRow.operation.slug,
    }
    const holderRow = resultRow(bestRow, operation)
    records.push({
      cohortKey,
      operation,
      workloadSummary: holderRow.workloadSummary,
      hardware: bestRow.run.hardwareModel,
      environmentSummary: [
        stored.environment.spec.software.cudaToolkit
          ? `CUDA ${stored.environment.spec.software.cudaToolkit}`
          : null,
        stored.environment.spec.software.framework
          ? `${stored.environment.spec.software.framework.name} ${stored.environment.spec.software.framework.version}`
          : null,
        stored.protocol.spec.harness.name,
      ]
        .filter(Boolean)
        .join(" · "),
      current: holderRow,
      since: events[0].at,
      history: events,
    })
  }

  records.sort((a, b) => b.since.localeCompare(a.since))
  return {
    illustrative: pageIllustrative(holderRows),
    hardwareOptions: [...new Set(records.map((holder) => holder.hardware))],
    records,
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
    operation: null,
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
    const families = await db()
      .selectDistinct({ family: schema.operations.family })
      .from(schema.operations)
      .orderBy(schema.operations.family)
      .limit(8)
    return {
      ...base,
      noResult: {
        guidance:
          query === ""
            ? "Search by operation, hardware, dtype, and shape — or start from an indexed operation family."
            : "No matching operation found. Search by operation name, family, or alias — shape, dtype, and hardware filters arrive with the full query parser.",
        suggestions: families.map((row) => row.family),
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
    operation: { name: operation.name, slug: operation.slug },
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
      const variant = manifest.spec.buildVariants?.[0]
      return {
        runId: null,
        implementation: {
          name: implementation.slug,
          slug: implementation.slug,
        },
        install: variant?.install.command
          ? { kind: variant.install.kind, command: variant.install.command }
          : null,
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
