// Precedent search (§12.8): gather the facts precedents-v1 scores from the
// published corpus. The request may name an operation nobody has indexed;
// candidates then come from reviewed relations, the family, and fuzzy
// hits, with the fallback stated in the interpretation.
import { and, eq, inArray, or, sql } from "drizzle-orm"
import type {
  Precedent,
  PrecedentInput,
  PrecedentsModel,
} from "../../lib/models/precedents.ts"
import { implementationDisplayName } from "../../lib/names.ts"
import {
  composeQuery,
  describeIntent,
  parseQuery,
} from "../../lib/search-query.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { EXTRACTOR_VERSION } from "../enrich/techniques.ts"
import {
  type ComputationRelation,
  gpuMatches,
  PRECEDENT_POLICY_VERSION,
  type PrecedentCandidate,
  scorePrecedent,
} from "../policy/precedents.ts"
import { cohortRanks } from "./cohorts.ts"
import { type AnyWorkloadManifest, runEvidence } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import { EXACTLY_EQUIVALENT, equivalentOperationIds } from "./relations.ts"
import {
  implementationColumns,
  primaryOf,
  projectColumns,
  runColumns,
  sourceColumns,
} from "./run-rows.ts"
import { resolveOperation } from "./search-reads.ts"

const DEFAULT_LIMIT = 10
const MAX_LIMIT = 25
/** Eligible runs loaded per search, fastest first. */
const CANDIDATE_RUNS = 4000
const RANKED_COHORTS = 300

export async function findPrecedents(
  input: PrecedentInput,
): Promise<PrecedentsModel> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, input.limit ?? DEFAULT_LIMIT))
  const intent = parseQuery(composeQuery(input))
  const database = db()

  // Computation proximity: one relation per candidate operation id.
  const hits = await resolveOperation(intent)
  const target = hits[0]?.operation ?? null
  const family = target?.family ?? intent.family
  const relations = new Map<string, ComputationRelation>()
  if (target) {
    relations.set(target.id, { kind: "same" })
    for (const id of await equivalentOperationIds(target.id))
      if (!relations.has(id)) relations.set(id, { kind: "equivalent" })
    const related = await database
      .select({
        from: schema.operationRelations.fromOperationId,
        to: schema.operationRelations.toOperationId,
        relation: schema.operationRelations.relation,
        rationale: schema.operationRelations.rationale,
      })
      .from(schema.operationRelations)
      .where(
        or(
          eq(schema.operationRelations.fromOperationId, target.id),
          eq(schema.operationRelations.toOperationId, target.id),
        ),
      )
    for (const row of related) {
      if (row.relation === EXACTLY_EQUIVALENT) continue
      const other = row.from === target.id ? row.to : row.from
      if (!relations.has(other))
        relations.set(other, { kind: "related", rationale: row.rationale })
    }
  }
  if (family) {
    const siblings = await database
      .select({ id: schema.operations.id })
      .from(schema.operations)
      .where(eq(schema.operations.family, family))
    for (const row of siblings)
      if (!relations.has(row.id))
        relations.set(row.id, { kind: "family", family })
  }
  for (const hit of hits)
    if (!relations.has(hit.operation.id))
      relations.set(hit.operation.id, { kind: "fuzzy", score: hit.score })

  const interpretation = target
    ? `${describeIntent(intent, target.name)}; precedents drawn from ${target.slug}${
        relations.size > 1 ? ", its relations, and its family" : ""
      }`
    : family
      ? `${describeIntent(intent, null)}; no indexed operation matched, so precedents come from the ${family} family`
      : `${describeIntent(intent, null)}; no indexed operation or family matched`

  const base: PrecedentsModel = {
    illustrative: false,
    interpretation,
    target: target
      ? { name: target.name, slug: target.slug, family: target.family }
      : null,
    policyVersion: PRECEDENT_POLICY_VERSION,
    precedents: [],
    considered: 0,
  }
  if (relations.size === 0) return base

  const rows = await database
    .select({
      run: runColumns,
      implementation: implementationColumns,
      project: projectColumns,
      source: sourceColumns,
      workload: {
        id: schema.workloads.id,
        dtypes: schema.workloads.dtypes,
        manifest: schema.workloads.manifest,
        operationId: schema.workloads.operationId,
      },
      operation: { name: schema.operations.name, slug: schema.operations.slug },
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
        inArray(schema.workloads.operationId, [...relations.keys()]),
        eligibleRunFilter(),
        input.includeUnsourced
          ? undefined
          : eq(schema.implementations.sourceAvailable, true),
      ),
    )
    .orderBy(schema.benchmarkRuns.primaryValue)
    .limit(CANDIDATE_RUNS)
  // An empty answer states its cause (§16: nothing dropped silently): when
  // the source constraint filtered every candidate, say so and name the way
  // to widen.
  if (rows.length === 0) {
    if (input.includeUnsourced) return base
    const [unsourced] = await database
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.benchmarkRuns)
      .innerJoin(
        schema.workloads,
        eq(schema.benchmarkRuns.workloadId, schema.workloads.id),
      )
      .where(
        and(
          inArray(schema.workloads.operationId, [...relations.keys()]),
          eligibleRunFilter(),
        ),
      )
    if (!unsourced || unsourced.n === 0) return base
    return {
      ...base,
      interpretation: `${interpretation}; ${unsourced.n} eligible runs exist only without public source (includeUnsourced widens)`,
    }
  }

  // Aggregate per implementation. "Best run": requested GPU beats other
  // hardware; within that, the metric's own direction decides — lower wins
  // for time units, higher for throughput metrics.
  const wantedGpu = intent.gpu
  const onWantedGpu = (model: string) =>
    wantedGpu !== null && gpuMatches(wantedGpu, model)
  const lowerIsBetter = (unit: string | null) =>
    unit === null || ["ns", "us", "ms", "s"].includes(unit)
  type Row = (typeof rows)[number]
  const better = (a: Row, b: Row): Row => {
    const aGpu = onWantedGpu(a.run.hardwareModel)
    if (aGpu !== onWantedGpu(b.run.hardwareModel)) return aGpu ? a : b
    const [av, bv] = [a.run.primaryValue, b.run.primaryValue]
    if (av === null || bv === null) return av !== null ? a : b
    return (lowerIsBetter(a.run.primaryUnit) ? av <= bv : av >= bv) ? a : b
  }
  type Group = { rows: Row[]; best: Row }
  const groups = new Map<string, Group>()
  for (const row of rows) {
    const group = groups.get(row.implementation.id)
    if (!group) {
      groups.set(row.implementation.id, { rows: [row], best: row })
      continue
    }
    group.rows.push(row)
    group.best = better(group.best, row)
  }

  const [ranks, traitRows] = await Promise.all([
    cohortRanks(
      [
        ...new Set([...groups.values()].map((g) => g.best.run.comparisonKey)),
      ].slice(0, RANKED_COHORTS),
    ),
    database
      .select({
        implementationId: schema.implementationTraits.implementationId,
        trait: schema.implementationTraits.trait,
      })
      .from(schema.implementationTraits)
      .where(
        and(
          inArray(schema.implementationTraits.implementationId, [
            ...groups.keys(),
          ]),
          eq(schema.implementationTraits.extractorVersion, EXTRACTOR_VERSION),
        ),
      ),
  ])
  const traitsById = new Map<string, string[]>()
  for (const row of traitRows)
    traitsById.set(row.implementationId, [
      ...(traitsById.get(row.implementationId) ?? []),
      row.trait,
    ])

  // The requested GPU's architecture, from any corpus row that carries it.
  const architecture =
    intent.architecture ??
    rows.find((row) => onWantedGpu(row.run.hardwareModel))?.run
      .hardwareArchitecture ??
    null
  // Technique overlap is measured against the target's own leaders.
  const leaderTraits = [
    ...new Set(
      [...groups.entries()]
        .filter(([, g]) => {
          const relation = relations.get(g.best.workload.operationId)?.kind
          const rank = ranks.byRun.get(g.best.run.id)?.rank ?? null
          return (
            (relation === "same" || relation === "equivalent") &&
            rank !== null &&
            rank <= 3
          )
        })
        .flatMap(([id]) => traitsById.get(id) ?? []),
    ),
  ]
  const request = {
    gpu: intent.gpu,
    architecture,
    dtypes: intent.dtypes,
    axes: intent.axes,
    leaderTraits,
  }

  const precedents: Precedent[] = [...groups.entries()].map(([id, group]) => {
    const { best } = group
    const rank = ranks.byRun.get(best.run.id)
    const candidate: PrecedentCandidate = {
      relation: relations.get(best.workload.operationId) ?? { kind: "none" },
      hardwareModels: [...new Set(group.rows.map((r) => r.run.hardwareModel))],
      architectures: [
        ...new Set(group.rows.map((r) => r.run.hardwareArchitecture)),
      ],
      dtypes: [...new Set(group.rows.flatMap((r) => r.workload.dtypes))],
      axes: group.rows.flatMap((r) => {
        const manifest = r.workload.manifest as AnyWorkloadManifest
        return manifest.kind === "WorkloadCase"
          ? [numericAxes(manifest.spec.axes)]
          : []
      }),
      bestRank: rank?.rank ?? null,
      bestEvidence: runEvidence(best.run),
      techniques: traitsById.get(id) ?? [],
    }
    const scored = scorePrecedent(request, candidate)
    const operation = { name: best.operation.name, slug: best.operation.slug }
    return {
      implementation: {
        name: implementationDisplayName(
          best.implementation.title ?? undefined,
          operation,
          best.implementation.slug,
        ),
        slug: best.implementation.slug,
      },
      project: { name: best.project.name, slug: best.project.slug },
      operation,
      ...scored,
      bestRun: {
        runId: best.run.id,
        hardware: best.run.hardwareModel,
        primary: primaryOf(best.run),
        rank: rank?.rank ?? null,
        cohortSize: rank?.cohortSize ?? null,
        evidence: runEvidence(best.run),
      },
      language: best.implementation.language,
      framework: best.implementation.framework,
      license: {
        declared: best.implementation.licenseDeclared,
        concluded: best.implementation.licenseExpression,
      },
      sourceAvailable: best.implementation.sourceAvailable,
      techniques: candidate.techniques,
    }
  })
  // Score decides; equal scores break ties by primary value only when the
  // two runs measured the same thing in a lower-is-better unit.
  precedents.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    const [pa, pb] = [a.bestRun?.primary, b.bestRun?.primary]
    if (
      pa &&
      pb &&
      pa.metric === pb.metric &&
      pa.unit === pb.unit &&
      lowerIsBetter(pa.unit)
    )
      return pa.value - pb.value
    return 0
  })
  return {
    ...base,
    illustrative: rows.every((row) => row.source.kind === "illustrative"),
    precedents: precedents.slice(0, limit),
    considered: precedents.length,
  }
}

/** Only numeric axis bindings take part in shape distance. */
function numericAxes(
  axes: Record<string, number | string>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(axes).filter(
      (entry): entry is [string, number] => typeof entry[1] === "number",
    ),
  )
}
