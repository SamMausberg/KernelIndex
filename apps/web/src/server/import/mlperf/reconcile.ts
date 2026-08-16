// Reconciliation (§14.4): rows onto canonical serving identity, deduplicated
// by content digest inside the bundle, then diffed against the live catalog
// for the §14.2 review report.
import { inArray } from "drizzle-orm"
import type { DbHandle } from "../../catalog/publication.ts"
import type { ServingImportBundle } from "../../catalog/serving-publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import type { ProposedObject } from "../report.ts"
import type { MlperfImportData } from "./discover.ts"
import {
  configurationFor,
  modelRevisionFor,
  projectFor,
  runFor,
  stackFor,
  workloadFor,
} from "./normalize.ts"
import { MLPERF_SOURCE, PARSER } from "./types.ts"

export type MlperfImportReport = {
  source: string
  parserVersion: string
  discovered: { rounds: number; rows: number; snapshots: number }
  skipped: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

export async function reconcileMlperf(
  database: DbHandle,
  data: MlperfImportData,
): Promise<{ bundle: ServingImportBundle; report: MlperfImportReport }> {
  const bundle: ServingImportBundle = {
    source: { ...MLPERF_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot, PARSER)),
    projects: [],
    models: [],
    stacks: [],
    configurations: [],
    workloads: [],
    runs: [],
  }
  const report: MlperfImportReport = {
    source: MLPERF_SOURCE.slug,
    parserVersion: PARSER.version,
    discovered: {
      rounds: data.rounds.length,
      rows: data.rounds.reduce((n, round) => n + round.rows.length, 0),
      snapshots: data.snapshots.length,
    },
    skipped: data.skipped,
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }

  const seenProjects = new Set<string>()
  const seenModels = new Set<string>()
  const seenStacks = new Set<string>()
  const seenConfigurations = new Set<string>()
  const seenWorkloads = new Set<string>()

  for (const { round, rows } of data.rounds) {
    for (const row of rows) {
      const model = modelRevisionFor(row.Model)
      const modelDigest = specDigest(model.manifest)
      if (!seenModels.has(modelDigest)) {
        seenModels.add(modelDigest)
        bundle.models.push(model)
      }

      const project = projectFor(row.Submitter)
      if (!seenProjects.has(project.slug)) {
        seenProjects.add(project.slug)
        bundle.projects.push(project)
      }

      const stack = stackFor(row)
      const stackDigest = specDigest(stack.manifest)
      if (!seenStacks.has(stackDigest)) {
        seenStacks.add(stackDigest)
        bundle.stacks.push(stack)
      }

      const configuration = configurationFor(row, stackDigest)
      const configurationDigest = specDigest(configuration.manifest)
      if (!seenConfigurations.has(configurationDigest)) {
        seenConfigurations.add(configurationDigest)
        bundle.configurations.push(configuration)
      }

      const workload = workloadFor(row.Model, row.Scenario)
      const workloadDigest = specDigest(workload.manifest)
      if (!seenWorkloads.has(workloadDigest)) {
        seenWorkloads.add(workloadDigest)
        bundle.workloads.push(workload)
      }

      bundle.runs.push({
        manifest: runFor({
          row,
          round,
          modelDigest,
          configurationDigest,
          workloadDigest,
        }),
        externalId: `${round.round}/${row.ID}`,
      })
    }
  }

  report.proposed = await proposedServingObjects(database, bundle)
  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${MLPERF_SOURCE.slug}' via the idempotent serving publication transaction`
  return { bundle, report }
}

/** Serving analogue of report.ts: proposed digests versus the live tables. */
export async function proposedServingObjects(
  database: DbHandle,
  bundle: ServingImportBundle,
): Promise<ProposedObject[]> {
  async function existing(
    column:
      | typeof schema.modelRevisions.modelDigest
      | typeof schema.servingStackRevisions.stackDigest
      | typeof schema.servingConfigurations.configurationDigest
      | typeof schema.servingWorkloads.workloadDigest
      | typeof schema.servingRuns.runDigest,
    digests: string[],
  ): Promise<Set<string>> {
    if (digests.length === 0) return new Set()
    const rows = await database
      .select({ digest: column })
      .from(column.table)
      .where(inArray(column, digests))
    return new Set(rows.map((row) => row.digest))
  }

  const sections = [
    {
      entity: "model" as const,
      column: schema.modelRevisions.modelDigest,
      entries: bundle.models.map((entry) => ({
        name: entry.slug,
        digest: specDigest(entry.manifest),
      })),
    },
    {
      entity: "stack" as const,
      column: schema.servingStackRevisions.stackDigest,
      entries: bundle.stacks.map((entry) => ({
        name: entry.slug,
        digest: specDigest(entry.manifest),
      })),
    },
    {
      entity: "configuration" as const,
      column: schema.servingConfigurations.configurationDigest,
      entries: bundle.configurations.map((entry) => ({
        name: entry.summary,
        digest: specDigest(entry.manifest),
      })),
    },
    {
      entity: "workload" as const,
      column: schema.servingWorkloads.workloadDigest,
      entries: bundle.workloads.map((entry) => ({
        name: entry.slug,
        digest: specDigest(entry.manifest),
      })),
    },
    {
      entity: "run" as const,
      column: schema.servingRuns.runDigest,
      entries: bundle.runs.map((entry) => ({
        name: entry.manifest.metadata.name,
        digest: specDigest(entry.manifest),
      })),
    },
  ]
  const proposed: ProposedObject[] = []
  for (const section of sections) {
    const present = await existing(
      section.column,
      section.entries.map((entry) => entry.digest),
    )
    for (const entry of section.entries) {
      proposed.push({
        entity: section.entity,
        name: entry.name,
        digest: entry.digest,
        action: present.has(entry.digest) ? "exists" : "insert",
      })
    }
  }
  return proposed
}
