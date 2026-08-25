// Search resolution (§12, §16.6): the deterministic query parser's intent is
// resolved to one operation (or a chooser), the runs are grouped into
// exact/compatible/supported/reported views, and unmeasured case bindings
// bracket to the nearest measured cases. Grouping and row assembly live in
// cohorts.ts and run-rows.ts.
import { and, eq, inArray, sql } from "drizzle-orm"
import type {
  NearestCase,
  OperationIndexEntry,
  ResultRow,
  SearchInput,
  SearchPageModel,
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
import { synonymTokens } from "../../lib/search-synonyms.ts"
import type { OperationSpecManifest } from "../../schemas/kinds.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { EXTRACTOR_VERSION } from "../enrich/techniques.ts"
import {
  type ChooserRun,
  chooserFacets,
  chooserMatch,
  rankChooserMatches,
} from "./chooser.ts"
import {
  defaultWorkloadId,
  fillCohortFacts,
  groupRuns,
  matchTarget,
  operationDtypes,
} from "./cohorts.ts"
import {
  bracketCases,
  bracketQuery,
  caseHasShape,
  intentMismatches,
} from "./match.ts"
import { getOperationIndex } from "./operation-reads.ts"
import { type AnyWorkloadManifest, workloadLabel } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import { equivalenceGroups, equivalentOperationIds } from "./relations.ts"
import {
  type ImplementationRows,
  implementationRows,
  type JoinedRun,
  joinedRunsForOperation,
  type OperationJoinedRun,
  opRef,
  pageIllustrative,
  primaryOf,
  sourceRefs,
  supportedUnmeasuredRows,
  type WorkloadRow,
} from "./run-rows.ts"

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
export type ResolvedOperation = Pick<
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
export async function resolveOperation(
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
  // Vocabulary bridges (lib/search-synonyms): "matrix multiplication" also
  // scores against matmul/gemm/mm — extra similarity terms and extra exact
  // alias candidates, never replacing what was typed.
  const synonyms = synonymTokens(terms)
  // Terms are charset-validated above and synonyms come from our own
  // curated table, so a literal `{a,b}` array is safe — the postgres-js
  // driver does not serialize JS arrays for `= any($n)`.
  const termsArray = `{${[...terms, ...synonyms].join(",")}}`
  const aliasCandidates = `{${[
    phrase,
    phraseSlug,
    phraseUnderscore,
    ...synonyms,
  ]
    .map((candidate) => `"${candidate}"`)
    .join(",")}}`

  const database = db()
  const scored = await database.execute(sql`
    select o.id, o.slug, o.family, o.name, o.manifest, (
      case
        when lower(o.slug) = ${phraseSlug}
          or replace(lower(o.slug), '-', '') = ${phraseCollapsed} then 400
        when exists (
          select 1 from ${schema.operationAliases} a
          where a.operation_id = o.id
            and (a.alias = any(${aliasCandidates}::text[])
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

/** Implementation slugs carrying every requested trait under the current
 * extractor; null when no tech: facet is present. */
async function techniqueFilter(
  techniques: string[],
  implRows: ImplementationRows,
): Promise<Set<string> | null> {
  if (techniques.length === 0) return null
  const rows = await db()
    .select({
      implementationId: schema.implementationTraits.implementationId,
      traits: sql<number>`count(distinct ${schema.implementationTraits.trait})::int`,
    })
    .from(schema.implementationTraits)
    .where(
      and(
        inArray(
          schema.implementationTraits.implementationId,
          implRows.map((row) => row.implementation.id),
        ),
        inArray(schema.implementationTraits.trait, techniques),
        eq(schema.implementationTraits.extractorVersion, EXTRACTOR_VERSION),
      ),
    )
    .groupBy(schema.implementationTraits.implementationId)
  const complete = new Set(
    rows
      .filter((row) => row.traits === techniques.length)
      .map((row) => row.implementationId),
  )
  return new Set(
    implRows
      .filter((row) => complete.has(row.implementation.id))
      .map((row) => row.implementation.slug),
  )
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
      techniques: intent.techniques,
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
  // Several plausible operations and no dominant hit: answer with the
  // most-measured candidate, interpretation stated (§12.1), and keep the
  // full list one click away (`choose`). With environment/dtype facets in
  // the query, each candidate row states its evidence under them (§16.6);
  // a tie, an evidence-free field, or an explicit `choose` shows the
  // chooser instead — never a silent guess.
  let operation = hits[0].operation
  let alternates: OperationIndexEntry[] | null = null
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
    // Clear leader: strictly the most matching evidence (or, unfaceted,
    // the most runs). matched runs count under the query's facets.
    const count = (entry: OperationIndexEntry) =>
      entry.match?.matching ?? entry.runs
    const ordered = [...matches].sort((a, b) => count(b) - count(a))
    const lead =
      ordered.length > 0 &&
      count(ordered[0]) > 0 &&
      (ordered.length === 1 || count(ordered[0]) > count(ordered[1]))
        ? ordered[0]
        : null
    const chosen =
      lead === null
        ? null
        : hits.find((hit) => hit.operation.slug === lead.slug)
    if (input.choose === true || chosen === undefined || chosen === null) {
      return { ...base, matches, noResult: null }
    }
    operation = chosen.operation
    alternates = matches.filter((entry) => entry.slug !== operation.slug)
  }
  const equivalentIds = await equivalentOperationIds(operation.id)
  const nearMisses = hits
    .filter((hit) => hit.operation.id !== operation.id)
    .slice(0, 5)
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
  // tech: facets hide rows after ranking, like trust and license (§11.4):
  // rank numbers keep their cohort meaning under the filter.
  const allowed = await techniqueFilter(intent.techniques, implRows)
  const cut = <T extends ResultRow>(rows: T[]) => {
    const kept = allowed
      ? rows.filter((row) => allowed.has(row.implementation.slug))
      : rows
    return {
      rows: kept.slice(0, GROUP_CAP),
      overflow: Math.max(0, kept.length - GROUP_CAP),
    }
  }
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
    matches: alternates,
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
