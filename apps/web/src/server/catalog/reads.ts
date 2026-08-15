// PostgreSQL-backed implementations of the catalog read seam (§27.5),
// returning the same page models as the fixtures. Only published, passed,
// unretracted, unsuperseded runs appear in result tables; the run page itself
// shows any published run including failed, superseded, and retracted
// evidence. Search interprets the query through the deterministic parser
// (§12.2–12.3) and ranks only inside cohorts under ranking-v1 (§11.5).
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  max,
  sql,
} from "drizzle-orm"
import type {
  BrowseFamily,
  CohortContext,
  ComparePageModel,
  CompareRun,
  HomePageModel,
  ImplementationPageModel,
  ImplementationSummary,
  KeyValue,
  OperationIndexEntry,
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
import {
  humanizeOperationName,
  implementationDisplayName,
} from "../../lib/names.ts"
import {
  describeIntent,
  parseQuery,
  removeToken,
  type SearchIntent,
} from "../../lib/search-query.ts"
import type {
  ImplementationRevisionManifest,
  OperationSpecManifest,
} from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  eligibilityReasons,
  RANKING_POLICY_VERSION,
  type RankInput,
  rankCohort,
} from "../policy/ranking.ts"
import {
  caseHasShape,
  intentMismatches,
  type MatchTarget,
  workloadMismatches,
} from "./match.ts"
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
import { eligibleRunFilter } from "./record-events.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

type JoinedRun = {
  run: RunRow
  implementation: typeof schema.implementations.$inferSelect
  project: typeof schema.projects.$inferSelect
  workload: typeof schema.workloads.$inferSelect
  source: typeof schema.sources.$inferSelect
}

/** Published eligible runs for one operation, fastest first. */
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
      and(eq(schema.workloads.operationId, operationId), eligibleRunFilter()),
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

/** Display ref for an operation row: humanized name over the stable slug. */
function opRef(operation: { name: string; slug: string }) {
  return { name: humanizeOperationName(operation.name), slug: operation.slug }
}

function resultRow(
  joined: JoinedRun,
  operation: { name: string; slug: string },
  extras: Partial<
    Pick<
      ResultRow,
      "match" | "mismatches" | "rank" | "tiedWithPrevious" | "caveats"
    >
  > = {},
): ResultRow {
  const { run, implementation, project, workload } = joined
  const stored = run.manifest as StoredRunManifest
  const manifest = implementation.manifest as ImplementationRevisionManifest
  const variant = manifest.spec.buildVariants?.[0]
  return {
    runId: run.id,
    implementation: {
      name: implementationDisplayName(
        manifest.metadata.title,
        operation,
        implementation.slug,
      ),
      slug: implementation.slug,
    },
    install: variant?.install.command
      ? { kind: variant.install.kind, command: variant.install.command }
      : null,
    project: { name: project.name, slug: project.slug },
    revision: implementation.sourceRevision?.slice(0, 7) ?? null,
    operation: opRef(operation),
    workloadSummary: [workload.dtypes.join("/"), workload.shapeSummary]
      .filter(Boolean)
      .join(" · "),
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
    tiedWithPrevious: extras.tiedWithPrevious ?? false,
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

/** Dtypes declared by the operation's tensor arguments (suite fallback). */
function operationDtypes(manifest: OperationSpecManifest): string[] {
  return [
    ...new Set(
      [...manifest.spec.inputs, ...manifest.spec.outputs]
        .map((argument) => argument.tensor?.dtype)
        .filter((dtype): dtype is string => dtype !== undefined),
    ),
  ]
}

function rankInputOf(joined: JoinedRun): RankInput {
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

/**
 * Group one operation's runs for a selected workload (§16.6, §11.1): the
 * largest same-key comparison cohort is the candidate table; requests that
 * every intent facet matches rank under ranking-v1, facet-mismatched runs
 * become compatible evidence with an explicit mismatch vector, same-workload
 * runs under another cohort stay separate, and other workloads' runs are
 * compatible with their differences enumerated.
 */
function groupRuns(
  joined: JoinedRun[],
  operation: { name: string; slug: string },
  operationManifest: OperationSpecManifest,
  selectedWorkloadId: string,
  intent: SearchIntent,
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

  const opDtypes = operationDtypes(operationManifest)
  const target = (j: JoinedRun): MatchTarget => ({
    hardwareModel: j.run.hardwareModel,
    hardwareArchitecture: j.run.hardwareArchitecture,
    cudaMajor: j.run.cudaMajor,
    framework: j.implementation.framework,
    language: j.implementation.language,
    workload: j.workload.manifest as AnyWorkloadManifest,
    workloadDtypes: j.workload.dtypes.length > 0 ? j.workload.dtypes : opDtypes,
    workloadLayouts: j.workload.layoutKeys,
  })

  const compatible: ResultRow[] = []
  const rankable: JoinedRun[] = []
  const unrankable: JoinedRun[] = []
  for (const j of primaryCohort) {
    const mismatches = intentMismatches(intent, target(j))
    if (mismatches.length > 0) {
      compatible.push(
        resultRow(j, operation, { match: "compatible", mismatches }),
      )
    } else if (j.run.primaryValue !== null) {
      rankable.push(j)
    } else {
      unrankable.push(j)
    }
  }

  const sourceNative = primaryCohort.some(
    (j) =>
      (j.run.manifest as StoredRunManifest).run.spec.sourceNative !== undefined,
  )
  const profile = sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  const byId = new Map(rankable.map((j) => [j.run.id, j]))
  const exact = rankCohort(rankable.map(rankInputOf), profile).map((entry) =>
    resultRow(byId.get(entry.id) as JoinedRun, operation, {
      rank: entry.rank,
      tiedWithPrevious: entry.tiedWithPrevious,
    }),
  )
  exact.push(
    ...unrankable.map((j) =>
      resultRow(j, operation, {
        caveats: ["No primary measurement; unranked (MISSING_PRIMARY_METRIC)"],
      }),
    ),
  )

  const reported = selected
    .filter((j) => j.run.comparisonKey !== cohortKey)
    .map((j) => {
      const mismatches = intentMismatches(intent, target(j))
      return resultRow(j, operation, {
        match: mismatches.length > 0 ? "compatible" : "exact",
        mismatches,
        caveats: [
          "Different comparison cohort: protocol or environment differs",
        ],
      })
    })

  for (const j of joined) {
    if (j.workload.id === selectedWorkloadId) continue
    const merged = intentMismatches(intent, target(j))
    if (selectedManifest) {
      for (const mismatch of workloadMismatches(
        selectedManifest,
        j.workload.manifest as AnyWorkloadManifest,
      )) {
        if (!merged.some((entry) => entry.field === mismatch.field))
          merged.push(mismatch)
      }
    }
    compatible.push(
      resultRow(j, operation, { match: "compatible", mismatches: merged }),
    )
  }

  const cohort: CohortContext | null = cohortKey
    ? {
        comparisonKey: cohortKey,
        profile,
        description: sourceNative
          ? `Source-native cohort: identical workload, protocol, and environment under the upstream harness. Ranked by the source's primary metric under ${RANKING_POLICY_VERSION}; unequal values keep the source order.`
          : `Identical workload, protocol, environment, and correctness policy. Ranked by primary metric under ${RANKING_POLICY_VERSION}; overlapping confidence intervals share a rank.`,
        facts: cohortFacts(primaryCohort[0] ?? selected[0] ?? joined[0]),
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

type OperationRow = typeof schema.operations.$inferSelect

/**
 * Tiered operation resolution in one explainable SQL query (§12.3–12.4):
 * exact slug (400) beats exact alias (300) beats a model-tag match (250)
 * beats exact family (200), then weighted full-text rank and per-term
 * trigram word similarity (over name, slug, family, and tags) break the
 * fuzzy tier. Hyphen/underscore-insensitive, so "rmsnorm" also finds
 * "069-rms-norm". A `model:` facet resolves even with no free text; other
 * facet tokens never reach this function.
 */
async function resolveOperation(intent: SearchIntent): Promise<{
  operation: OperationRow | null
  nearMisses: OperationRow[]
}> {
  const terms = [
    ...new Set(
      (intent.family !== null ? [intent.family, ...intent.text] : intent.text)
        .filter((term) =>
          /^(?=[a-z0-9_-]*[a-z])[a-z0-9][a-z0-9_-]{2,}$/.test(term),
        )
        .filter((term) => !SEARCH_STOPWORDS.has(term)),
    ),
  ]
  if (terms.length === 0 && intent.model === null) {
    return { operation: null, nearMisses: [] }
  }
  const phrase = terms.join(" ")
  // Exact tiers must cover the whole request: a one-token alias hit must not
  // outrank full term coverage of a longer query (§12.4). All three phrase
  // spellings (spaces, hyphens, underscores) and the collapsed form count.
  const phraseSlug = terms.join("-")
  const phraseUnderscore = terms.join("_")
  const phraseCollapsed = terms
    .map((term) => term.replaceAll(/[-_]/g, ""))
    .join("")
  // Terms are charset-validated above, so a literal `{a,b}` array is safe —
  // the postgres-js driver does not serialize JS arrays for `= any($n)`.
  const termsArray = `{${terms.join(",")}}`

  const database = db()
  const scored = await database.execute(sql`
    select o.id, (
      case
        when lower(o.slug) = ${phraseSlug}
          or replace(lower(o.slug), '-', '') = ${phraseCollapsed} then 400
        when exists (
          select 1 from ${schema.operationAliases} a
          where a.operation_id = o.id
            and (a.alias in (${phrase}, ${phraseSlug}, ${phraseUnderscore})
              or replace(replace(a.alias, '_', ''), '-', '') = ${phraseCollapsed})
        ) then 300
        when o.family in (${phrase}, ${phraseSlug}) then 200
        else 0
      end
      + case
        when ${intent.model}::text is not null and exists (
          select 1 from unnest(o.tags) as g(tag)
          where g.tag like 'model:' || ${intent.model} || '%'
        ) then 250
        else 0
      end
      + ts_rank(o.search_vector, websearch_to_tsquery('english', ${phrase})) * 50
      + (
        select coalesce(sum(greatest(
          word_similarity(t.term, o.name),
          word_similarity(t.term, o.slug),
          word_similarity(t.term, o.family),
          (
            select coalesce(max(word_similarity(t.term,
              case when g.tag like 'model:%' then substr(g.tag, 7) else g.tag end
            )), 0)
            from unnest(o.tags) as g(tag)
          ))), 0)
        from unnest(${termsArray}::text[]) as t(term)
      ) * 10
    ) as score
    from ${schema.operations} o
    order by score desc, o.created_at asc
    limit 6
  `)
  const hits = [...scored]
    .map((row) => ({ id: row.id as string, score: Number(row.score) }))
    .filter((hit) => hit.score >= 8)
  if (hits.length === 0) return { operation: null, nearMisses: [] }

  const rows = await database
    .select()
    .from(schema.operations)
    .where(
      inArray(
        schema.operations.id,
        hits.map((hit) => hit.id),
      ),
    )
  const byId = new Map(rows.map((row) => [row.id, row]))
  const ordered = hits
    .map((hit) => byId.get(hit.id))
    .filter((row): row is OperationRow => row !== undefined)
  return { operation: ordered[0] ?? null, nearMisses: ordered.slice(1) }
}

/**
 * Choose the workload the request binds (§12.5): an exact case matching the
 * requested shape/axes/dtypes wins (measured cases first), otherwise the
 * workload with the most runs.
 */
function selectWorkloadId(
  intent: SearchIntent,
  workloadRows: (typeof schema.workloads.$inferSelect)[],
  joined: JoinedRun[],
): string | null {
  const bindsCase = intent.shape !== null || Object.keys(intent.axes).length > 0
  if (bindsCase) {
    const matches = workloadRows.filter((row) => {
      const manifest = row.manifest as AnyWorkloadManifest
      if (manifest.kind !== "WorkloadCase") return false
      if (intent.shape !== null && !caseHasShape(manifest, intent.shape))
        return false
      if (
        !Object.entries(intent.axes).every(
          ([axis, value]) => manifest.spec.axes[axis] === value,
        )
      )
        return false
      return intent.dtypes.every((dtype) => row.dtypes.includes(dtype))
    })
    const measured = matches.find((row) =>
      joined.some((j) => j.workload.id === row.id),
    )
    if (measured) return measured.id
    if (matches.length > 0) return matches[0].id
  }
  return defaultWorkloadId(
    joined,
    workloadRows.map((row) => row.id),
  )
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
    .where(eligibleRunFilter())
    .orderBy(desc(schema.benchmarkRuns.observedAt))
    .limit(8)
  return {
    illustrative: pageIllustrative(rows),
    latest: rows.map((j) =>
      resultRow(j, { name: j.operation.name, slug: j.operation.slug }),
    ),
  }
}

/**
 * §16.12: the records ledger reads the append-only record_events table
 * (§11.10). Events whose run has since lost eligibility (retraction,
 * supersession) drop out of the visible sequence; until the correction write
 * path ships, no retraction-cause events exist to display in their place.
 */
export async function getRecordsPage(): Promise<RecordsPageModel> {
  const rows = await db()
    .select({
      event: schema.recordEvents,
      run: schema.benchmarkRuns,
      implementation: schema.implementations,
      project: schema.projects,
      workload: schema.workloads,
      source: schema.sources,
      operation: schema.operations,
    })
    .from(schema.recordEvents)
    .innerJoin(
      schema.benchmarkRuns,
      eq(schema.recordEvents.runId, schema.benchmarkRuns.id),
    )
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
    .where(eligibleRunFilter())
    .orderBy(asc(schema.recordEvents.at), asc(schema.recordEvents.createdAt))

  const byCohort = new Map<string, typeof rows>()
  for (const row of rows) {
    byCohort.set(row.event.comparisonKey, [
      ...(byCohort.get(row.event.comparisonKey) ?? []),
      row,
    ])
  }

  const records: RecordHolder[] = []
  const holderRows: (typeof rows)[number][] = []
  for (const [cohortKey, cohortRows] of byCohort) {
    const events: RecordEvent[] = []
    let previous: (typeof rows)[number] | null = null
    for (const row of cohortRows) {
      const operation = {
        name: row.operation.name,
        slug: row.operation.slug,
      }
      const current = resultRow(row, operation)
      const previousPrimary = previous
        ? resultRow(previous, operation).primary
        : null
      events.unshift({
        at: row.event.at.toISOString(),
        runId: row.run.id,
        implementation: current.implementation,
        value: current.primary as RecordEvent["value"],
        previousValue: previousPrimary,
        improvementPct:
          previousPrimary && current.primary
            ? ((previousPrimary.value - current.primary.value) /
                previousPrimary.value) *
              100
            : null,
      })
      previous = row
    }
    if (previous === null) continue
    holderRows.push(previous)
    const stored = previous.run.manifest as StoredRunManifest
    const operation = {
      name: previous.operation.name,
      slug: previous.operation.slug,
    }
    const holderRow = resultRow(previous, operation)
    records.push({
      cohortKey,
      operation: opRef(operation),
      workloadSummary: holderRow.workloadSummary,
      hardware: previous.run.hardwareModel,
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

/**
 * The compact corpus index behind search suggestions and browse: every
 * operation with its humanized name, family, eligible run count, and newest
 * observation date. Two grouped queries; the result ships inline with the
 * page (§16.5).
 */
export async function getOperationIndex(): Promise<OperationIndexEntry[]> {
  const database = db()
  const [operations, runStats] = await Promise.all([
    database
      .select({
        name: schema.operations.name,
        slug: schema.operations.slug,
        family: schema.operations.family,
        id: schema.operations.id,
      })
      .from(schema.operations),
    database
      .select({
        operationId: schema.workloads.operationId,
        n: count(),
        lastObservedAt: max(schema.benchmarkRuns.observedAt),
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(eligibleRunFilter())
      .groupBy(schema.workloads.operationId),
  ])
  const statsById = new Map(runStats.map((row) => [row.operationId, row]))
  return operations.map((operation) => {
    const stats = statsById.get(operation.id)
    return {
      name: humanizeOperationName(operation.name),
      slug: operation.slug,
      family: operation.family,
      runs: stats?.n ?? 0,
      lastObservedAt: stats?.lastObservedAt?.toISOString() ?? null,
    }
  })
}

/** §16.5 start state: the published corpus grouped by operation family. */
async function browseFamilies(): Promise<BrowseFamily[]> {
  const database = db()
  const [operations, runs] = await Promise.all([
    database
      .select({ family: schema.operations.family, n: count() })
      .from(schema.operations)
      .groupBy(schema.operations.family),
    database
      .select({ family: schema.operations.family, n: count() })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .innerJoin(
        schema.operations,
        eq(schema.workloads.operationId, schema.operations.id),
      )
      .where(eligibleRunFilter())
      .groupBy(schema.operations.family),
  ])
  const runsByFamily = new Map(runs.map((row) => [row.family, row.n]))
  return operations
    .map((row) => ({
      family: row.family,
      operations: row.n,
      runs: runsByFamily.get(row.family) ?? 0,
    }))
    .sort((a, b) => b.runs - a.runs || a.family.localeCompare(b.family))
}

const EMPTY_GROUPS = {
  exact: [],
  compatible: [],
  supportedUnmeasured: [],
  reported: [],
}

export async function searchCatalog(
  input: SearchInput,
): Promise<SearchPageModel> {
  const query = input.query.trim()
  const intent = parseQuery(query)
  const base: Omit<SearchPageModel, "noResult"> = {
    illustrative: false,
    query,
    interpretedQuery: describeIntent(intent, null),
    facets: intent.facets.map((facet) => ({
      token: facet.token,
      display: facet.display,
      removeQuery: removeToken(query, facet.token),
    })),
    queryIssues: intent.issues,
    policy: {
      minimumTrust: intent.minimumTrust,
      license: intent.license,
      requireSource: intent.requireSource,
      requireInstallable: intent.requireInstallable,
    },
    operation: null,
    browse: null,
    cohort: null,
    groups: EMPTY_GROUPS,
    related: [],
    sources: [],
  }
  if (query === "") {
    return { ...base, browse: await browseFamilies(), noResult: null }
  }
  const { operation, nearMisses } = await resolveOperation(intent)
  if (!operation) {
    const families = await db()
      .selectDistinct({ family: schema.operations.family })
      .from(schema.operations)
      .orderBy(schema.operations.family)
      .limit(8)
    const facetsOnly = intent.facets.length > 0
    return {
      ...base,
      noResult: {
        guidance: facetsOnly
          ? "The recognized facets need an operation to narrow. Add an operation name, family, or alias."
          : "No matching operation found. Search by operation name, family, or alias — recognized shape, dtype, and hardware facets then narrow the results.",
        suggestions: [
          ...nearMisses.map((op) => op.slug),
          ...families.map((row) => row.family),
        ].slice(0, 8),
      },
    }
  }

  const database = db()
  const [joined, workloadRows, related, implRows] = await Promise.all([
    joinedRunsForOperation(operation.id),
    database
      .select()
      .from(schema.workloads)
      .where(eq(schema.workloads.operationId, operation.id)),
    database
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.family, operation.family))
      .limit(6),
    implementationRows(operation.id),
  ])
  const selectedWorkloadId = selectWorkloadId(intent, workloadRows, joined)
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        operation.manifest as OperationSpecManifest,
        selectedWorkloadId,
        intent,
      )
    : { ...EMPTY_GROUPS, cohort: null }
  const relatedItems = [...related, ...nearMisses]
    .filter(
      (op, index, all) =>
        op.id !== operation.id &&
        all.findIndex((other) => other.id === op.id) === index,
    )
    .slice(0, 6)
    .map((op) => ({
      kind: "operation" as const,
      name: humanizeOperationName(op.name),
      slug: op.slug,
      summary: `Operation in the ${op.family} family`,
    }))

  return {
    ...base,
    illustrative: pageIllustrative(joined),
    interpretedQuery: describeIntent(
      intent,
      humanizeOperationName(operation.name),
    ),
    operation: opRef(operation),
    cohort: groups.cohort,
    groups: {
      exact: groups.exact,
      compatible: groups.compatible,
      supportedUnmeasured: supportedUnmeasuredRows(operation, joined, implRows),
      reported: groups.reported,
    },
    related: relatedItems,
    sources: sourceRefs(joined),
    noResult: null,
  }
}

/** Implementations (with their project) declared for one operation. */
async function implementationRows(operationId: string) {
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
    .where(eq(schema.implementations.operationId, operationId))
}

type ImplementationRows = Awaited<ReturnType<typeof implementationRows>>

/** Implementations declaring support for the operation but with no run. */
function supportedUnmeasuredRows(
  operation: typeof schema.operations.$inferSelect,
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
          ? { kind: variant.install.kind, command: variant.install.command }
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

  const [workloadRows, aliases, joined, implRows] = await Promise.all([
    database
      .select()
      .from(schema.workloads)
      .where(eq(schema.workloads.operationId, operation.id)),
    database
      .select({ alias: schema.operationAliases.alias })
      .from(schema.operationAliases)
      .where(eq(schema.operationAliases.operationId, operation.id)),
    joinedRunsForOperation(operation.id),
    implementationRows(operation.id),
  ])
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
        manifest,
        selectedWorkloadId,
        parseQuery(""),
      )
    : { exact: [], reported: [], compatible: [], cohort: null }

  const implementations = implementationSummaries(implRows, joined, operation)
  const evidence = joined.map((j) => runEvidence(j.run))

  return {
    illustrative: pageIllustrative(joined),
    operation: {
      id: operation.id,
      slug: operation.slug,
      name: humanizeOperationName(operation.name),
      family: operation.family,
      aliases: aliases.map((row) => row.alias),
      models: operation.tags
        .filter((tag) => tag.startsWith("model:"))
        .map((tag) => tag.slice(6)),
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

function implementationSummaries(
  rows: ImplementationRows,
  joined: JoinedRun[],
  operation: { name: string; slug: string },
): ImplementationSummary[] {
  return rows.map(({ implementation, project }) => {
    const best = joined.find((j) => j.implementation.id === implementation.id)
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
      name: implementationDisplayName(
        manifest.metadata.title,
        operation,
        implementation.slug,
      ),
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

  const [measurementRows, artifactRows, [supersededBy], cohortRuns, [link]] =
    await Promise.all([
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
      database
        .select()
        .from(schema.benchmarkRuns)
        .where(
          and(
            eq(schema.benchmarkRuns.comparisonKey, run.comparisonKey),
            eligibleRunFilter(),
            isNotNull(schema.benchmarkRuns.primaryValue),
          ),
        ),
      database
        .select({ externalId: schema.sourceLinks.externalId })
        .from(schema.sourceLinks)
        .where(
          and(
            eq(schema.sourceLinks.entityKind, "run"),
            eq(schema.sourceLinks.entityId, run.id),
          ),
        ),
    ])

  const ineligibleReasons = eligibilityReasons({
    status: run.status,
    published: run.publishedAt !== null,
    retracted: run.retractedAt !== null,
    superseded: supersededBy !== undefined,
    primaryValue: run.primaryValue,
  })
  const eligible = ineligibleReasons.length === 0
  const profile =
    stored.run.spec.sourceNative !== undefined
      ? ("source_native" as const)
      : ("strict_exact" as const)
  const ranked = rankCohort(
    cohortRuns.map((cohortRun) => ({
      id: cohortRun.id,
      value: cohortRun.primaryValue as number,
      interval:
        cohortRun.uncertaintyLow !== null && cohortRun.uncertaintyHigh !== null
          ? { low: cohortRun.uncertaintyLow, high: cohortRun.uncertaintyHigh }
          : null,
      evidence: runEvidence(cohortRun),
      observedAt: cohortRun.observedAt,
    })),
    profile,
  )
  const rank = eligible
    ? (ranked.find((entry) => entry.id === run.id)?.rank ?? null)
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
      profile,
      rank,
      eligible,
      ineligibleReasons,
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

const MAX_COMPARE = 8

/** Short digest for aligned compare cells. */
const short = (digest: string) => digest.replace("sha256:", "").slice(0, 8)

/**
 * §16.11: compare two to eight runs. Ranks exist only when every selected
 * run shares one comparison cohort and is eligible; otherwise the aligned
 * field diff names the first material mismatch and what would need to match.
 */
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
      "Select two to eight runs to compare. Every result row and run dossier links here.",
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
  const sourceNative = ordered.some(
    (row) =>
      (row.run.manifest as StoredRunManifest).run.spec.sourceNative !==
      undefined,
  )
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
      sourceAvailable: row.run.sourceAvailable,
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
      const stored = row.run.manifest as StoredRunManifest
      return `${row.run.primaryMetric} ${stored.run.spec.timing?.primaryStatistic ?? "value"} (${row.run.primaryUnit ?? "—"})`
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
    field("license", false, (row) => row.run.licenseExpression),
    field("source", false, (row) =>
      row.run.sourceAvailable ? "available" : "unavailable",
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
