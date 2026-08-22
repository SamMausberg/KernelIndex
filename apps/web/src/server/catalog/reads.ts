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
  CohortContext,
  ComparePageModel,
  CompareRun,
  HomePageModel,
  ImplementationPageModel,
  ImplementationSummary,
  NearestCase,
  OperationIndexEntry,
  OperationPageModel,
  PrimaryMetric,
  RecordEvent,
  RecordHolder,
  RecordsPageModel,
  ResultRow,
  RunPageModel,
  SearchInput,
  SearchPageModel,
  SourceRef,
} from "../../lib/catalog-models.ts"
import { dtypeLabel } from "../../lib/format.ts"
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
import { attestationCounts, attestationsFor } from "../attestations.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import {
  eligibilityReasons,
  RANKING_POLICY_VERSION,
  type RankInput,
  rankCohort,
} from "../policy/ranking.ts"
import {
  type ChooserRun,
  chooserFacets,
  chooserMatch,
  rankChooserMatches,
} from "./chooser.ts"
import {
  bracketCases,
  bracketQuery,
  caseHasShape,
  intentMismatches,
  type MatchTarget,
  workloadMismatches,
} from "./match.ts"
import {
  type AnyWorkloadManifest,
  bestEvidence,
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
import { equivalenceGroups, equivalentOperationIds } from "./relations.ts"
import { eligibleServingRuns } from "./serving-reads.ts"
import { diffSource } from "./source-diff.ts"
import { computeSweep } from "./sweep.ts"

// Hardware, project, and model reads live beside this module; the seam
// resolves them through the same import (§27.5).
export { getFeed } from "./feed-reads.ts"
export { getModelIndex, getModelPage } from "./model-reads.ts"
export {
  getHardwareIndex,
  getHardwarePage,
  getProjectIndex,
  getProjectPage,
} from "./surfaces.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Lean projections for ranked surfaces: scalar columns only, never the JSONB
// manifests, which dominate transfer and parse cost at corpus scale (§16).
// Exported for the sibling model-reads module, which assembles the same
// joined-run shape with extra operation columns.
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
type WorkloadRow = typeof schema.workloads.$inferSelect

export type JoinedRun = {
  run: Pick<RunRow, keyof typeof runColumns>
  implementation: Pick<ImplementationRow, keyof typeof implementationColumns>
  project: Pick<typeof schema.projects.$inferSelect, "name" | "slug">
  workload: Pick<WorkloadRow, "id" | "dtypes" | "shapeSummary">
  source: Pick<typeof schema.sources.$inferSelect, "slug" | "kind" | "name">
}

/** Operation-scoped rows carry extra workload scalars for matching; the
 * workload manifests are loaded once per operation, never per run. */
type OperationJoinedRun = JoinedRun & {
  workload: Pick<WorkloadRow, "id" | "dtypes" | "shapeSummary" | "layoutKeys">
}

/** Published eligible runs for one operation — reviewed-equivalent ids ride
 * along so one page presents every definition's cohorts (still separate
 * cohorts) — fastest first. Bounded: the ranked table, sweep, and compatible
 * groups never show more than this, and the tail is reachable through the
 * API's cursor surfaces. */
const OPERATION_RUNS_LIMIT = 600
async function joinedRunsForOperation(
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
function opRef(operation: { name: string; slug: string }) {
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
      implementation.installCommand !== null &&
      implementation.installKind !== null
        ? {
            kind: implementation.installKind,
            command: implementation.installCommand,
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

/** The matchable facts of one run (§12.5), with the operation's declared
 * dtypes standing in when the workload row carries none. */
function matchTarget(
  j: OperationJoinedRun,
  manifestById: Map<string, AnyWorkloadManifest>,
  opDtypes: string[],
): MatchTarget {
  return {
    hardwareModel: j.run.hardwareModel,
    hardwareArchitecture: j.run.hardwareArchitecture,
    cudaMajor: j.run.cudaMajor,
    framework: j.implementation.framework,
    language: j.implementation.language,
    workload: manifestById.get(j.workload.id) as AnyWorkloadManifest,
    workloadDtypes: j.workload.dtypes.length > 0 ? j.workload.dtypes : opDtypes,
    workloadLayouts: j.workload.layoutKeys,
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
  joined: OperationJoinedRun[],
  operation: { name: string; slug: string },
  operationManifest: OperationSpecManifest,
  /** Workload manifests keyed by workload id — loaded once per operation. */
  manifestById: Map<string, AnyWorkloadManifest>,
  selectedWorkloadId: string,
  intent: SearchIntent,
  preferredCohortKey?: string,
) {
  const selected = joined.filter((j) => j.workload.id === selectedWorkloadId)
  const byCohort = new Map<string, OperationJoinedRun[]>()
  for (const j of selected) {
    const bucket = byCohort.get(j.run.comparisonKey)
    if (bucket) bucket.push(j)
    else byCohort.set(j.run.comparisonKey, [j])
  }
  const rankedCohorts = [...byCohort.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )
  // One selectable option per measured environment cohort, each stating its
  // fastest rankable run (rows arrive fastest first); equal hardware labels
  // (distinct runner fleets) get a human ordinal — the cohort facts panel
  // states what actually differs, never a leaked digest fragment.
  const cohortOptions = rankedCohorts.map(([key, list]) => {
    const head = list.find((j) => j.run.primaryValue !== null)
    const primary = head ? primaryOf(head.run) : null
    return {
      key,
      label: list[0].run.hardwareModel,
      runs: list.length,
      head:
        head && primary
          ? {
              runId: head.run.id,
              implementation: {
                name: implementationDisplayName(
                  head.implementation.title ?? undefined,
                  operation,
                  head.implementation.slug,
                ),
                slug: head.implementation.slug,
              },
              primary,
            }
          : null,
    }
  })
  const labelCounts = new Map<string, number>()
  for (const option of cohortOptions) {
    labelCounts.set(option.label, (labelCounts.get(option.label) ?? 0) + 1)
  }
  const labelOrdinals = new Map<string, number>()
  for (const option of cohortOptions) {
    if ((labelCounts.get(option.label) ?? 0) > 1) {
      const ordinal = (labelOrdinals.get(option.label) ?? 0) + 1
      labelOrdinals.set(option.label, ordinal)
      option.label = `${option.label} · env ${ordinal}`
    }
  }
  const primaryCohort =
    (preferredCohortKey !== undefined
      ? byCohort.get(preferredCohortKey)
      : undefined) ??
    rankedCohorts[0]?.[1] ??
    []
  const cohortKey = primaryCohort[0]?.run.comparisonKey ?? null
  const selectedManifest = manifestById.get(selectedWorkloadId)

  const opDtypes = operationDtypes(operationManifest)
  const target = (j: OperationJoinedRun) =>
    matchTarget(j, manifestById, opDtypes)

  const compatible: ResultRow[] = []
  const rankable: OperationJoinedRun[] = []
  const unrankable: OperationJoinedRun[] = []
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

  const sourceNative = primaryCohort.some((j) => j.run.sourceNative)
  const profile = sourceNative
    ? ("source_native" as const)
    : ("strict_exact" as const)
  const byId = new Map(rankable.map((j) => [j.run.id, j]))
  const exact = rankCohort(rankable.map(rankInputOf), profile).map((entry) =>
    resultRow(byId.get(entry.id) as OperationJoinedRun, operation, {
      rank: entry.rank,
      tiedWithPrevious: entry.tiedWithPrevious,
      cohortSize: rankable.length,
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
    const workloadManifest = manifestById.get(j.workload.id)
    if (selectedManifest && workloadManifest) {
      for (const mismatch of workloadMismatches(
        selectedManifest,
        workloadManifest,
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
          ? `Measured by the source's own harness. Ranked by its metric under ${RANKING_POLICY_VERSION}.`
          : `Same workload, protocol, and environment throughout. Ranked by latency under ${RANKING_POLICY_VERSION}; runs too close to call share a rank.`,
        facts: [],
      }
    : null

  const headRunId =
    (primaryCohort[0] ?? selected[0] ?? joined[0])?.run.id ?? null
  return { exact, reported, compatible, cohort, cohortOptions, headRunId }
}

/**
 * Facts every row in the cohort shares (§16.6) — rendered once, not per row.
 * The protocol/environment details live only in the manifest, so this loads
 * exactly one run's JSONB after grouping instead of shipping it per row.
 */
async function fillCohortFacts(groups: {
  cohort: CohortContext | null
  headRunId: string | null
}): Promise<void> {
  if (!groups.cohort || groups.headRunId === null) return
  const [joined] = await db()
    .select({
      manifest: schema.benchmarkRuns.manifest,
      workloadManifest: schema.workloads.manifest,
      dtypes: schema.workloads.dtypes,
    })
    .from(schema.benchmarkRuns)
    .innerJoin(
      schema.workloads,
      eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
    )
    .where(eq(schema.benchmarkRuns.id, groups.headRunId))
  if (!joined) return
  const stored = joined.manifest as StoredRunManifest
  const { hardware, software } = stored.environment.spec
  const measurement = stored.protocol.spec.measurement
  const framework = software.framework
    ? `${software.framework.name} ${software.framework.version}`
    : null
  // A source that never declared its statistic renders as the harness alone,
  // not the word "unspecified" presented as if it were one.
  const statistic =
    measurement.primaryStatistic === "unspecified"
      ? null
      : measurement.primaryStatistic
  const protocol = [
    `${stored.protocol.spec.harness.name}${stored.protocol.spec.harness.version ? ` ${stored.protocol.spec.harness.version}` : ""}`,
    statistic && measurement.samples
      ? `${statistic} of ${measurement.samples}`
      : statistic,
    measurement.compileIncluded === false ? "compile excluded" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const entries: [string, string | null | undefined][] = [
    ["GPU", hardware.product],
    [
      "Workload",
      workloadLabel(
        joined.workloadManifest as AnyWorkloadManifest,
        joined.dtypes,
      ),
    ],
    ["CUDA", software.cudaToolkit],
    ["Driver", software.driver],
    ["Framework", framework],
    ["Protocol", protocol],
  ]
  groups.cohort.facts = entries
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
/** The columns operation resolution carries forward into result assembly. */
type ResolvedOperation = Pick<
  OperationRow,
  "id" | "slug" | "family" | "name" | "manifest"
>

/**
 * Tiered operation resolution in one explainable SQL query (§12.3–12.4):
 * exact slug (400) beats exact alias (300) beats a model-tag match (250)
 * beats exact family (200), then weighted full-text rank and per-term
 * trigram word similarity (over name, slug, family, and tags) break the
 * fuzzy tier. Hyphen/underscore-insensitive, so "rmsnorm" also finds
 * "069-rms-norm". A `model:` facet resolves even with no free text; other
 * facet tokens never reach this function. Returns every plausible hit with
 * its score, best first — the caller decides whether the top hit dominates
 * or the user should choose.
 */
async function resolveOperation(
  intent: SearchIntent,
): Promise<{ operation: ResolvedOperation; score: number }[]> {
  const terms = [
    ...new Set(
      (intent.family !== null ? [intent.family, ...intent.text] : intent.text)
        .filter((term) =>
          /^(?=[a-z0-9_-]*[a-z])[a-z0-9][a-z0-9_-]{2,}$/.test(term),
        )
        .filter((term) => !SEARCH_STOPWORDS.has(term)),
    ),
  ]
  if (terms.length === 0 && intent.model === null) return []
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
    select o.id, o.slug, o.family, o.name, o.manifest, (
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
    limit 20
  `)
  return [...scored]
    .map((row) => ({
      operation: {
        id: row.id,
        slug: row.slug,
        family: row.family,
        name: row.name,
        manifest: row.manifest,
      } as ResolvedOperation,
      score: Number(row.score),
    }))
    .filter((hit) => hit.score >= 8)
}

/**
 * Does the best hit clearly name one operation? An exact slug, alias, or
 * model-tag tier (≥ 250) always does; below that a fuzzy winner must beat
 * the runner-up decisively, otherwise the user chooses (§12.1: the result
 * page states the inferred mode and lets the user correct it).
 */
function dominates(hits: { score: number }[]): boolean {
  if (hits.length === 0) return false
  if (hits[0].score >= 250 || hits.length === 1) return true
  return hits[0].score - hits[1].score >= 40
}

/**
 * Choose the workload the request binds (§12.5): an exact case matching the
 * requested shape/axes/dtypes wins (measured cases first), otherwise the
 * workload with the most runs.
 */
function selectWorkloadId(
  intent: SearchIntent,
  workloadRows: WorkloadRow[],
  joined: JoinedRun[],
): string | null {
  if (bindsCase(intent)) {
    const matches = workloadRows.filter((row) => caseMatches(intent, row))
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

/** Shapes and axis bindings bind an exact case (§12.5). */
const bindsCase = (intent: SearchIntent) =>
  intent.shape !== null || Object.keys(intent.axes).length > 0

/** Does this workload answer the request's case binding exactly? */
function caseMatches(intent: SearchIntent, row: WorkloadRow): boolean {
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
}

/**
 * §12.5 bracketing. The request bound a case nobody measured: the measured
 * cases on either side of it along the one axis that differs, each with its
 * fastest eligible run under the request's remaining facets (GPU, dtype,
 * framework still apply; only the case binding is lifted). A side without
 * such a run is dropped; both dropped means no claim at all.
 */
function nearestCases(
  query: string,
  intent: SearchIntent,
  workloadRows: WorkloadRow[],
  joined: OperationJoinedRun[],
  manifestById: Map<string, AnyWorkloadManifest>,
  operation: { name: string; slug: string },
  operationManifest: OperationSpecManifest,
): SearchPageModel["nearest"] {
  // Only measured cases can bracket: reviewed-equivalent definitions carry
  // duplicate cases, and an unmeasured twin must never be the neighbour.
  const measured = new Set(joined.map((j) => j.workload.id))
  const bracket = bracketCases(
    intent,
    workloadRows.flatMap((row) => {
      const manifest = manifestById.get(row.id)
      if (manifest?.kind !== "WorkloadCase" || !measured.has(row.id)) return []
      return [
        {
          id: row.id,
          axes: manifest.spec.axes,
          shape: Object.values(manifest.spec.tensors)[0]?.shape ?? null,
          dtypes: row.dtypes,
        },
      ]
    }),
  )
  if (bracket === null) return null
  const facets: SearchIntent = { ...intent, axes: {}, shape: null }
  const opDtypes = operationDtypes(operationManifest)
  const dtypesById = new Map(workloadRows.map((row) => [row.id, row.dtypes]))
  const side = (
    entry: { id: string; value: number } | null,
  ): NearestCase | null => {
    if (entry === null) return null
    // Joined rows arrive fastest first, so the first measured one leads.
    const runs = joined.filter(
      (j) =>
        j.workload.id === entry.id &&
        intentMismatches(facets, matchTarget(j, manifestById, opDtypes))
          .length === 0,
    )
    if (runs.length === 0) return null
    const head = runs.find((j) => j.run.primaryValue !== null)
    const primary = head ? primaryOf(head.run) : null
    return {
      workloadId: entry.id,
      label: workloadLabel(
        manifestById.get(entry.id) as AnyWorkloadManifest,
        dtypesById.get(entry.id) ?? [],
      ),
      value: entry.value,
      runs: runs.length,
      head:
        head && primary
          ? {
              runId: head.run.id,
              implementation: {
                name: implementationDisplayName(
                  head.implementation.title ?? undefined,
                  operation,
                  head.implementation.slug,
                ),
                slug: head.implementation.slug,
              },
              primary,
            }
          : null,
      cohortKey: head?.run.comparisonKey ?? null,
      query: bracketQuery(query, bracket, entry.value),
    }
  }
  const below = side(bracket.below)
  const above = side(bracket.above)
  if (below === null && above === null) return null
  return { axis: bracket.axis, requested: bracket.requested, below, above }
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

/** §16.5: the homepage feed leads with signal, not importer publish order —
 * the newest genuine record breaks (a run displacing a previous record),
 * then the newest first-of-cohort records, sole-entrant baselines excluded.
 * Reuses the memoized ledger read; only the stat counts hit new queries. */
export async function getHomePage(): Promise<HomePageModel> {
  const [page, [stats], [servingStats]] = await Promise.all([
    getRecordsPage(),
    db()
      .select({
        operations: sql<number>`count(distinct ${schema.workloads.operationId})::int`,
        runs: sql<number>`count(*)::int`,
        gpus: sql<number>`count(distinct ${schema.benchmarkRuns.hardwareModel})::int`,
        // Evidence distribution mirroring policy/trust.ts evidenceLevel;
        // verified folds in replicated — both mean "rerun independently".
        verified: sql<number>`count(*) filter (where ${schema.benchmarkRuns.independentReplicationCount} >= 2 or ${schema.benchmarkRuns.reproducedByKernelindex})::int`,
        reproducible: sql<number>`count(*) filter (where not (${schema.benchmarkRuns.independentReplicationCount} >= 2 or ${schema.benchmarkRuns.reproducedByKernelindex}) and ${schema.benchmarkRuns.sourceAvailable} and ${schema.benchmarkRuns.hasRawEvidence})::int`,
      })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(eligibleRunFilter()),
    db()
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.servingRuns)
      .where(eligibleServingRuns()),
  ])
  // Homepage lists default to source-backed records (2026-08-16 decision);
  // the ledger's source toggle reaches the rest.
  const holders = page.records.filter(
    (holder) => holder.current.sourceAvailable,
  )
  const latest = [
    ...holders.filter((holder) => holder.history.length >= 2),
    ...holders.filter(
      (holder) => holder.history.length === 1 && !holder.current.baseline,
    ),
  ]
    .slice(0, 8)
    // The homepage renders only the current event; drop the deep histories.
    .map((holder) => ({ ...holder, history: holder.history.slice(0, 1) }))
  return {
    illustrative: page.illustrative,
    latest,
    stats: {
      operations: stats.operations,
      runs: stats.runs,
      gpus: stats.gpus,
      servingRuns: servingStats?.n ?? 0,
      evidence: {
        verified: stats.verified,
        reproducible: stats.reproducible,
        reported: stats.runs - stats.verified - stats.reproducible,
      },
    },
  }
}

/**
 * §16.12: the records ledger reads the append-only record_events table
 * (§11.10). Events whose run has since lost eligibility (retraction,
 * supersession) drop out of the visible sequence; until the correction write
 * path ships, no retraction-cause events exist to display in their place.
 *
 * The full ledger outgrows the framework data cache's entry limit, so it
 * memoizes in-process instead — shared by every caller of this module
 * (records page and /records/data, the GPU/project surfaces, badges), which
 * previously each re-ran the unbounded query.
 */
const RECORDS_MEMO_MS = 60_000
let recordsMemo: { at: number; value: Promise<RecordsPageModel> } | null = null
export function getRecordsPage(): Promise<RecordsPageModel> {
  if (recordsMemo && Date.now() - recordsMemo.at < RECORDS_MEMO_MS) {
    return recordsMemo.value
  }
  const value = readRecordsPage()
  recordsMemo = { at: Date.now(), value }
  value.catch(() => {
    recordsMemo = null
  })
  return value
}

async function readRecordsPage(): Promise<RecordsPageModel> {
  const rows = await db()
    .select({
      event: {
        comparisonKey: schema.recordEvents.comparisonKey,
        at: schema.recordEvents.at,
      },
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        shapeSummary: schema.workloads.shapeSummary,
      },
      source: sourceColumns,
      operation: {
        name: schema.operations.name,
        slug: schema.operations.slug,
      },
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
    const bucket = byCohort.get(row.event.comparisonKey)
    if (bucket) bucket.push(row)
    else byCohort.set(row.event.comparisonKey, [row])
  }

  const records: RecordHolder[] = []
  const holderRows: (typeof rows)[number][] = []
  for (const [cohortKey, cohortRows] of byCohort) {
    const events: RecordEvent[] = []
    let previous: (typeof rows)[number] | null = null
    let previousPrimary: ResultRow["primary"] = null
    let holderRow: ResultRow | null = null
    for (const row of cohortRows) {
      const operation = {
        name: row.operation.name,
        slug: row.operation.slug,
      }
      const current = resultRow(row, operation)
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
      previousPrimary = current.primary
      holderRow = current
    }
    if (previous === null || holderRow === null) continue
    holderRows.push(previous)
    records.push({
      cohortKey,
      operation: holderRow.operation,
      workloadId: previous.workload.id,
      workloadSummary: holderRow.workloadSummary,
      hardware: previous.run.hardwareModel,
      environmentSummary: previous.run.environmentSummary ?? "",
      current: holderRow,
      since: events[0].at,
      // Eligible ⇒ published; observedAt only satisfies the nullable type.
      indexedAt: (
        previous.run.publishedAt ?? previous.run.observedAt
      ).toISOString(),
      history: events,
    })
  }

  // Newest indexed first (§16.5): a fresh import leads even when the source
  // stamped it with old observation dates. ISO-8601 strings order
  // lexicographically; plain comparison beats collation.
  records.sort((a, b) =>
    a.indexedAt < b.indexedAt ? 1 : a.indexedAt > b.indexedAt ? -1 : 0,
  )
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
  const [operations, aliasRows, runStats] = await Promise.all([
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
        operationId: schema.operationAliases.operationId,
        alias: schema.operationAliases.alias,
      })
      .from(schema.operationAliases),
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
  const aliasesById = new Map<string, string[]>()
  for (const row of aliasRows) {
    const bucket = aliasesById.get(row.operationId)
    if (bucket) bucket.push(row.alias)
    else aliasesById.set(row.operationId, [row.alias])
  }
  // Reviewed-equivalent definitions collapse to one browse/chooser row: the
  // member with the most evidence carries the union counts, and the other
  // definitions' names stay findable as aliases. Presentation only — the
  // operation pages and cohorts of every member remain intact (§8.4).
  const byId = new Map(operations.map((operation) => [operation.id, operation]))
  const skip = new Set<string>()
  for (const ids of new Set((await equivalenceGroups()).values())) {
    const members = ids.flatMap((id) => byId.get(id) ?? [])
    if (members.length < 2) continue
    const [canonical, ...rest] = [...members].sort(
      (a, b) =>
        (statsById.get(b.id)?.n ?? 0) - (statsById.get(a.id)?.n ?? 0) ||
        a.slug.localeCompare(b.slug),
    )
    const canonicalStats = statsById.get(canonical.id) ?? {
      operationId: canonical.id,
      n: 0,
      lastObservedAt: null,
    }
    const canonicalAliases = aliasesById.get(canonical.id) ?? []
    aliasesById.set(canonical.id, canonicalAliases)
    for (const member of rest) {
      skip.add(member.id)
      const stats = statsById.get(member.id)
      canonicalStats.n += stats?.n ?? 0
      if (
        stats?.lastObservedAt &&
        (canonicalStats.lastObservedAt === null ||
          stats.lastObservedAt > canonicalStats.lastObservedAt)
      )
        canonicalStats.lastObservedAt = stats.lastObservedAt
      canonicalAliases.push(
        member.name,
        member.slug,
        ...(aliasesById.get(member.id) ?? []),
      )
    }
    statsById.set(canonical.id, canonicalStats)
  }
  return operations
    .filter((operation) => !skip.has(operation.id))
    .map((operation) => {
      const stats = statsById.get(operation.id)
      return {
        name: humanizeOperationName(operation.name),
        slug: operation.slug,
        family: operation.family,
        aliases: aliasesById.get(operation.id) ?? [],
        runs: stats?.n ?? 0,
        lastObservedAt: stats?.lastObservedAt?.toISOString() ?? null,
      }
    })
}

const EMPTY_GROUPS = {
  exact: [],
  compatible: [],
  supportedUnmeasured: [],
  reported: [],
}
const NO_OVERFLOW = {
  exact: 0,
  compatible: 0,
  supportedUnmeasured: 0,
  reported: 0,
}
/** Per-group payload cap (§16): four pages of the 50-row view. */
const GROUP_CAP = 200

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
    matches: null,
    cohort: null,
    cohortOptions: [],
    groups: EMPTY_GROUPS,
    overflow: NO_OVERFLOW,
    related: [],
    sources: [],
    nearest: null,
  }
  if (query === "") {
    return { ...base, browse: await getOperationIndex(), noResult: null }
  }
  const hits = await resolveOperation(intent)
  if (hits.length === 0) {
    const index = await getOperationIndex()
    const runsByFamily = new Map<string, number>()
    for (const entry of index) {
      runsByFamily.set(
        entry.family,
        (runsByFamily.get(entry.family) ?? 0) + entry.runs,
      )
    }
    const facetsOnly = intent.facets.length > 0
    return {
      ...base,
      noResult: {
        guidance: facetsOnly
          ? "Filters alone can't find an operation. Add its name."
          : "No operation by that name. Try one of these families:",
        suggestions: [...runsByFamily.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([family]) => ({ label: family, query: family })),
      },
    }
  }
  // Several plausible operations and no dominant hit: the user chooses.
  // With environment/dtype facets in the query, each candidate row states
  // its evidence under them (§16.6) and evidence-bearing candidates lead.
  if (!dominates(hits)) {
    const bySlug = new Map(
      (await getOperationIndex()).map((entry) => [entry.slug, entry]),
    )
    let matches = hits.flatMap((hit) => bySlug.get(hit.operation.slug) ?? [])
    const facets = chooserFacets(intent)
    if (facets !== null && matches.length > 0) {
      const idBySlug = new Map(
        hits.map((hit) => [hit.operation.slug, hit.operation.id]),
      )
      // Chooser rows count reviewed-equivalent evidence too, matching the
      // union their operation pages present.
      const groups = await equivalenceGroups()
      const idsFor = (id: string) => groups.get(id) ?? [id]
      const runRows = await db()
        .select({
          operationId: schema.workloads.operationId,
          hardwareModel: schema.benchmarkRuns.hardwareModel,
          hardwareArchitecture: schema.benchmarkRuns.hardwareArchitecture,
          cudaMajor: schema.benchmarkRuns.cudaMajor,
          workloadDtypes: schema.workloads.dtypes,
          sourceAvailable: schema.benchmarkRuns.sourceAvailable,
          primaryValue: schema.benchmarkRuns.primaryValue,
          primaryUnit: schema.benchmarkRuns.primaryUnit,
        })
        .from(schema.benchmarkRuns)
        .innerJoin(
          schema.workloads,
          eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
        )
        .where(
          and(
            inArray(
              schema.workloads.operationId,
              [...idBySlug.values()].flatMap(idsFor),
            ),
            eligibleRunFilter(),
          ),
        )
      const byOperation = new Map<string, ChooserRun[]>()
      for (const { operationId, ...run } of runRows) {
        byOperation.set(operationId, [
          ...(byOperation.get(operationId) ?? []),
          run,
        ])
      }
      matches = rankChooserMatches(
        matches.map((entry) => ({
          ...entry,
          match: chooserMatch(
            idsFor(idBySlug.get(entry.slug) ?? "").flatMap(
              (id) => byOperation.get(id) ?? [],
            ),
            facets,
          ),
        })),
      )
    }
    return { ...base, matches, noResult: null }
  }
  const operation = hits[0].operation
  const equivalentIds = await equivalentOperationIds(operation.id)
  const nearMisses = hits
    .slice(1, 6)
    .map((hit) => hit.operation)
    .filter((op) => !equivalentIds.includes(op.id))

  const database = db()
  const [joined, workloadRows, related, implRows] = await Promise.all([
    joinedRunsForOperation(equivalentIds),
    database
      .select()
      .from(schema.workloads)
      .where(inArray(schema.workloads.operationId, equivalentIds)),
    database
      .select()
      .from(schema.operations)
      .where(eq(schema.operations.family, operation.family))
      .limit(6),
    implementationRows(equivalentIds),
  ])
  const selectedWorkloadId = selectWorkloadId(intent, workloadRows, joined)
  const manifestById = new Map(
    workloadRows.map((row) => [row.id, row.manifest as AnyWorkloadManifest]),
  )
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        operation.manifest as OperationSpecManifest,
        manifestById,
        selectedWorkloadId,
        intent,
        input.cohort,
      )
    : { ...EMPTY_GROUPS, cohort: null, cohortOptions: [], headRunId: null }
  // The request bound a case nobody measured: bracket it (§12.5).
  const nearest =
    bindsCase(intent) && !workloadRows.some((row) => caseMatches(intent, row))
      ? nearestCases(
          query,
          intent,
          workloadRows,
          joined,
          manifestById,
          { name: operation.name, slug: operation.slug },
          operation.manifest as OperationSpecManifest,
        )
      : null
  // Independent round trips: cohort facts and source refs together.
  const [, sources] = await Promise.all([
    fillCohortFacts(groups),
    sourceRefs(joined),
  ])
  const relatedItems = [...related, ...nearMisses]
    .filter(
      (op, index, all) =>
        !equivalentIds.includes(op.id) &&
        all.findIndex((other) => other.id === op.id) === index,
    )
    .slice(0, 6)
    .map((op) => ({
      kind: "operation" as const,
      name: humanizeOperationName(op.name),
      slug: op.slug,
      summary: `Operation in the ${op.family} family`,
    }))

  // Payload guard at corpus scale (§16): every group is capped and the view
  // reports exactly what was cut — nothing is dropped silently.
  const supported = supportedUnmeasuredRows(operation, joined, implRows)
  const cut = <T>(rows: T[]) => ({
    rows: rows.slice(0, GROUP_CAP),
    overflow: Math.max(0, rows.length - GROUP_CAP),
  })
  const exact = cut(groups.exact)
  const compatible = cut(groups.compatible)
  const supportedCut = cut(supported)
  const reported = cut(groups.reported)
  return {
    ...base,
    illustrative: pageIllustrative(joined),
    interpretedQuery: describeIntent(
      intent,
      humanizeOperationName(operation.name),
    ),
    operation: opRef(operation),
    cohort: groups.cohort,
    cohortOptions: groups.cohortOptions,
    overflow: {
      exact: exact.overflow,
      compatible: compatible.overflow,
      supportedUnmeasured: supportedCut.overflow,
      reported: reported.overflow,
    },
    groups: {
      exact: exact.rows,
      compatible: compatible.rows,
      supportedUnmeasured: supportedCut.rows,
      reported: reported.rows,
    },
    related: relatedItems,
    sources,
    noResult: null,
    nearest,
  }
}

/** Implementations (with their project) declared for one operation and its
 * reviewed equivalents. */
async function implementationRows(operationIds: string[]) {
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

type ImplementationRows = Awaited<ReturnType<typeof implementationRows>>

/** Implementations declaring support for the operation but with no run. */
function supportedUnmeasuredRows(
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

export async function getOperationPage(
  slug: string,
  workload?: string,
  cohort?: string,
): Promise<OperationPageModel | null> {
  const database = db()
  const [operation] = await database
    .select()
    .from(schema.operations)
    .where(eq(schema.operations.slug, slug))
  if (!operation) return null
  const manifest = operation.manifest as OperationSpecManifest
  const equivalentIds = await equivalentOperationIds(operation.id)

  const [workloadRows, aliases, joined, implRows, equivalentRows] =
    await Promise.all([
      database
        .select()
        .from(schema.workloads)
        .where(inArray(schema.workloads.operationId, equivalentIds)),
      database
        .select({ alias: schema.operationAliases.alias })
        .from(schema.operationAliases)
        .where(eq(schema.operationAliases.operationId, operation.id)),
      joinedRunsForOperation(equivalentIds),
      implementationRows(equivalentIds),
      database
        .select({
          id: schema.operations.id,
          name: schema.operations.name,
          slug: schema.operations.slug,
        })
        .from(schema.operations)
        .where(inArray(schema.operations.id, equivalentIds)),
    ])
  const requestedWorkload = workloadRows.find(
    (w) => w.id === workload || w.workloadDigest === workload,
  )
  const selectedWorkloadId =
    requestedWorkload?.id ??
    defaultWorkloadId(
      joined,
      workloadRows.map((w) => w.id),
    )
  const manifestById = new Map(
    workloadRows.map((row) => [row.id, row.manifest as AnyWorkloadManifest]),
  )
  const groups = selectedWorkloadId
    ? groupRuns(
        joined,
        { name: operation.name, slug: operation.slug },
        manifest,
        manifestById,
        selectedWorkloadId,
        parseQuery(""),
        cohort,
      )
    : {
        exact: [],
        reported: [],
        compatible: [],
        cohort: null,
        cohortOptions: [],
        headRunId: null,
      }
  // Independent round trips: cohort facts and source refs together.
  const [, operationSources] = await Promise.all([
    fillCohortFacts(groups),
    sourceRefs(joined),
  ])

  const implementations = implementationSummaries(implRows, joined, operation)
  const evidence = joined.map((j) => runEvidence(j.run))

  // Sweep inputs (§16.8): everything that must be held constant for two
  // runs to share the chart, folded into one key; the axes come from the
  // WorkloadCase manifests already loaded above.
  const sweepConstant = (j: OperationJoinedRun) =>
    [
      j.run.protocolKey,
      j.run.environmentKey,
      j.run.hardwareModel,
      j.run.primaryMetric,
      j.run.primaryStatistic ?? "value",
      j.run.primaryUnit ?? "",
      j.workload.dtypes.join("/"),
    ].join("|")
  const anchor =
    groups.cohort !== null
      ? (joined.find(
          (j) => j.run.comparisonKey === groups.cohort?.comparisonKey,
        ) ?? null)
      : null
  const sweep = computeSweep({
    anchorWorkloadId: selectedWorkloadId,
    anchorConstantKey: anchor ? sweepConstant(anchor) : null,
    environmentLabel: anchor
      ? [anchor.run.hardwareModel, anchor.run.environmentSummary]
          .filter(Boolean)
          .join(" · ")
      : "",
    metricLabel: anchor
      ? `${anchor.run.primaryMetric} · ${anchor.run.primaryStatistic ?? "value"}`
      : "",
    unit: anchor?.run.primaryUnit ?? "",
    lowerIsBetter: (anchor?.run.primaryUnit ?? "ns") === "ns",
    runs: joined
      .filter((j) => j.run.primaryValue !== null)
      .map((j) => ({
        workloadId: j.workload.id,
        implementation: {
          name: implementationDisplayName(
            j.implementation.title ?? undefined,
            operation,
            j.implementation.slug,
          ),
          slug: j.implementation.slug,
        },
        value: j.run.primaryValue as number,
        constantKey: sweepConstant(j),
      })),
    workloadAxes: new Map(
      workloadRows.flatMap((row) => {
        const workloadManifest = row.manifest as AnyWorkloadManifest
        return workloadManifest.kind === "WorkloadCase"
          ? [[row.id, { ...workloadManifest.spec.axes }] as const]
          : []
      }),
    ),
  })

  return {
    illustrative: pageIllustrative(joined),
    operation: {
      id: operation.id,
      slug: operation.slug,
      name: humanizeOperationName(operation.name),
      family: operation.family,
      aliases: aliases.map((row) => row.alias),
      equivalents: equivalentRows
        .filter((row) => row.id !== operation.id)
        .map((row) => ({
          name: humanizeOperationName(row.name),
          slug: row.slug,
        })),
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
        dtypes: row.dtypes,
        toleranceSummary: toleranceSummary(workloadManifest),
      }
    }),
    selectedWorkloadId,
    cohortOptions: groups.cohortOptions,
    cohort: groups.cohort,
    records: groups.exact,
    sweep,
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
    sources: operationSources,
  }
}

/** The per-source ingestion policy jsonb (§14.10), defensively read. */
type SourcePolicy = { license?: string; attribution?: string; url?: string }
function sourcePolicy(policy: unknown): SourcePolicy {
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

function implementationSummaries(
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

const SUBMISSION_VERSION = /^submission-(\d+)$/

function submissionNumber(version: string | undefined): number | null {
  const match = version?.match(SUBMISSION_VERSION)
  return match ? Number(match[1]) : null
}

function sourceLanguage(mediaType: string): "python" | "cpp" | "text" {
  if (mediaType === "text/x-python") return "python"
  if (mediaType === "text/x-cuda") return "cpp"
  return "text"
}

/**
 * Mirrored source for one implementation (§16.9): the inline artifact named
 * by the manifest's source digest, plus a line diff against the same
 * author's previous imported submission on this operation — the "what
 * changed to make it faster" evidence. Artifact bodies load only here.
 */
/** SPDX LicenseRef ids shown to humans as the license's actual name, so the
 * same license never appears under two spellings across pages. */
const LICENSE_DISPLAY: Record<string, string> = {
  "LicenseRef-GPUMode-Reciprocity-1.0":
    "June 9 Researcher Reciprocity License v1.0",
}

async function implementationSourceCode(
  database: ReturnType<typeof db>,
  implementation: typeof schema.implementations.$inferSelect,
  operation: { name: string; slug: string },
  sourceSlug: string | null,
): Promise<ImplementationPageModel["sourceCode"]> {
  const manifest = implementation.manifest as ImplementationRevisionManifest
  const spec = manifest.spec.source
  if (!spec) return null
  const current = submissionNumber(manifest.spec.projectRevision.version)
  // The artifact, attribution, and sibling-revision reads are independent
  // round trips; only the previous-artifact fetch depends on the siblings.
  const [[artifact], attributionRow, siblings] = await Promise.all([
    database
      .select({
        content: schema.artifacts.content,
        mediaType: schema.artifacts.mediaType,
        license: schema.artifacts.license,
      })
      .from(schema.artifacts)
      .where(eq(schema.artifacts.contentDigest, spec.contentDigest)),
    sourceSlug !== null
      ? database
          .select({ name: schema.sources.name, policy: schema.sources.policy })
          .from(schema.sources)
          .where(eq(schema.sources.slug, sourceSlug))
          .then(([sourceRow]) => sourceRow ?? null)
      : null,
    current !== null
      ? database
          .select({
            slug: schema.implementations.slug,
            title: schema.implementations.title,
            manifest: schema.implementations.manifest,
          })
          .from(schema.implementations)
          .where(
            and(
              eq(schema.implementations.projectId, implementation.projectId),
              eq(
                schema.implementations.operationId,
                implementation.operationId,
              ),
            ),
          )
      : [],
  ])
  if (!artifact || artifact.content === null) return null

  let attribution: { text: string; url: string | null } | null = null
  if (attributionRow) {
    const policy = sourcePolicy(attributionRow.policy)
    attribution = {
      text: policy.attribution ?? attributionRow.name,
      url: policy.url ?? null,
    }
  }

  let diff: NonNullable<ImplementationPageModel["sourceCode"]>["diff"] = null
  if (current !== null) {
    const previous = siblings
      .map((sibling) => {
        const siblingSpec = (sibling.manifest as ImplementationRevisionManifest)
          .spec
        return {
          sibling,
          digest: siblingSpec.source?.contentDigest,
          number: submissionNumber(siblingSpec.projectRevision.version),
        }
      })
      .filter(
        (entry): entry is typeof entry & { digest: string; number: number } =>
          entry.digest !== undefined &&
          entry.number !== null &&
          entry.number < current,
      )
      .sort((a, b) => b.number - a.number)[0]
    if (previous) {
      const [previousArtifact] = await database
        .select({ content: schema.artifacts.content })
        .from(schema.artifacts)
        .where(eq(schema.artifacts.contentDigest, previous.digest))
      if (previousArtifact?.content) {
        diff = {
          previousSlug: previous.sibling.slug,
          previousName: implementationDisplayName(
            previous.sibling.title ?? undefined,
            operation,
            previous.sibling.slug,
          ),
          lines: diffSource(previousArtifact.content, artifact.content),
        }
      }
    }
  }

  return {
    fileName: spec.fileName ?? null,
    language: sourceLanguage(artifact.mediaType),
    content: artifact.content,
    license: artifact.license
      ? (LICENSE_DISPLAY[artifact.license] ?? artifact.license)
      : artifact.license,
    attribution,
    diff,
  }
}

/**
 * ranking-v1 over whole cohorts (§11.5): rank, tie, and cohort size for every
 * eligible run in the given comparison cohorts, plus each cohort's #1. One
 * lean query however many keys — the run dossier asks for one, the
 * implementation page for every cohort its revision appears in.
 */
async function cohortRanks(comparisonKeys: string[]) {
  const byRun = new Map<
    string,
    Pick<ResultRow, "rank" | "tiedWithPrevious" | "cohortSize">
  >()
  const headByCohort = new Map<string, string>()
  if (comparisonKeys.length === 0) return { byRun, headByCohort }
  const rows = await db()
    .select({
      id: schema.benchmarkRuns.id,
      comparisonKey: schema.benchmarkRuns.comparisonKey,
      primaryValue: schema.benchmarkRuns.primaryValue,
      uncertaintyLow: schema.benchmarkRuns.uncertaintyLow,
      uncertaintyHigh: schema.benchmarkRuns.uncertaintyHigh,
      observedAt: schema.benchmarkRuns.observedAt,
      sourceNative: schema.benchmarkRuns.sourceNative,
      reproducedByKernelindex: schema.benchmarkRuns.reproducedByKernelindex,
      independentReplicationCount:
        schema.benchmarkRuns.independentReplicationCount,
      sourceAvailable: schema.benchmarkRuns.sourceAvailable,
      installable: schema.benchmarkRuns.installable,
      hasRawEvidence: schema.benchmarkRuns.hasRawEvidence,
    })
    .from(schema.benchmarkRuns)
    .where(
      and(
        inArray(schema.benchmarkRuns.comparisonKey, comparisonKeys),
        eligibleRunFilter(),
        isNotNull(schema.benchmarkRuns.primaryValue),
      ),
    )
  const byCohort = new Map<string, typeof rows>()
  for (const row of rows) {
    const bucket = byCohort.get(row.comparisonKey)
    if (bucket) bucket.push(row)
    else byCohort.set(row.comparisonKey, [row])
  }
  for (const [key, cohort] of byCohort) {
    const ranked = rankCohort(
      cohort.map((row) => ({
        id: row.id,
        value: row.primaryValue as number,
        interval:
          row.uncertaintyLow !== null && row.uncertaintyHigh !== null
            ? { low: row.uncertaintyLow, high: row.uncertaintyHigh }
            : null,
        evidence: runEvidence(row),
        observedAt: row.observedAt,
      })),
      cohort.some((row) => row.sourceNative) ? "source_native" : "strict_exact",
    )
    for (const entry of ranked)
      byRun.set(entry.id, {
        rank: entry.rank,
        tiedWithPrevious: entry.tiedWithPrevious,
        cohortSize: ranked.length,
      })
    headByCohort.set(key, ranked[0].id)
  }
  return { byRun, headByCohort }
}

// Cohorts ranked per implementation page; a library baseline measured on
// hundreds of workloads keeps its deeper rows unranked rather than loading
// thousands of cohort rows for a disclosure few open.
const IMPLEMENTATION_RANKED_COHORTS = 200

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

  // benchmark_runs_implementation_idx serves this directly; never load the
  // whole operation's runs to show one implementation.
  const joined: JoinedRun[] = await database
    .select({
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        shapeSummary: schema.workloads.shapeSummary,
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
        eq(schema.benchmarkRuns.implementationId, implementation.id),
        eligibleRunFilter(),
      ),
    )
    .orderBy(schema.benchmarkRuns.primaryValue)
  const variant = manifest.spec.buildVariants?.[0]
  // "Best evidence level for this revision" means the strongest run, never
  // the fastest one — a per-run row elsewhere must never outrank this label.
  const evidence = bestEvidence(joined.map((j) => j.run))
  // Independent round trips: source refs, the source-code bundle, the
  // cohort ranks behind every evidence row, and the ledger for standing.
  const [refs, sourceCode, ranks, ledger] = await Promise.all([
    sourceRefs(joined),
    implementationSourceCode(
      database,
      implementation,
      { name: operation.name, slug: operation.slug },
      joined[0]?.source.slug ?? null,
    ),
    cohortRanks(
      [...new Set(joined.map((j) => j.run.comparisonKey))].slice(
        0,
        IMPLEMENTATION_RANKED_COHORTS,
      ),
    ),
    getRecordsPage(),
  ])
  const bestResults = joined.map((j) =>
    resultRow(
      j,
      { name: operation.name, slug: operation.slug },
      ranks.byRun.get(j.run.id),
    ),
  )
  const runIds = new Set(joined.map((j) => j.run.id))
  const records = ledger.records.filter(
    (holder) =>
      holder.current.runId !== null && runIds.has(holder.current.runId),
  ).length

  // §16.10: community attestations on each evidence row, one grouped count.
  const notes = await attestationCounts(
    bestResults.flatMap((row) => (row.runId === null ? [] : [row.runId])),
  )
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
    standing: { records },
    bestResults: bestResults.map((row) => ({
      ...row,
      attestations: row.runId === null ? 0 : (notes.get(row.runId) ?? 0),
    })),
    limitations: manifest.spec.support.axes ?? [],
    provenance: {
      source: refs[0] ?? null,
      authors: (manifest.metadata.authors ?? [])
        .map((author) => author.github ?? author.name)
        .filter((author): author is string => author !== undefined),
      importedAt: implementation.createdAt.toISOString(),
    },
    sourceCode,
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

export * from "./coverage-reads.ts"
// Serving reads (§8.16, Week 9) live in their own module; re-exported so
// the seam's dynamic import of this file satisfies one interface.
export * from "./serving-reads.ts"
