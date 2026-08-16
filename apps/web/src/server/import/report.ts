// Shared import-report primitive (§14.7): every importer reconciles into the
// same publication bundle shape, so comparing proposed digests against the
// live catalog for the §14.2 dry-run report is common code.
import { inArray } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../catalog/publication.ts"
import * as schema from "../db/schema.ts"
import { specDigest } from "../identity/digest.ts"

export type ProposedObject = {
  entity:
    | "operation"
    | "workload"
    | "implementation"
    | "run"
    | "project"
    // Serving entities (§10.1 Week 9) share the same report shape.
    | "model"
    | "stack"
    | "configuration"
  name: string
  digest: string
  action: "insert" | "exists"
}

async function existingDigests(
  database: DbHandle,
  table:
    | typeof schema.operations.semanticDigest
    | typeof schema.workloads.workloadDigest
    | typeof schema.implementations.implementationDigest
    | typeof schema.benchmarkRuns.runDigest,
  digests: string[],
): Promise<Set<string>> {
  if (digests.length === 0) return new Set()
  const rows = await database
    .select({ digest: table })
    .from(table.table)
    .where(inArray(table, digests))
  return new Set(rows.map((row) => row.digest))
}

/** What publishing this bundle would insert versus what already exists. */
export async function proposedObjects(
  database: DbHandle,
  bundle: ImportBundle,
): Promise<ProposedObject[]> {
  const digestsOf = (
    entries: { manifest: Parameters<typeof specDigest>[0] }[],
  ) => entries.map((entry) => specDigest(entry.manifest))
  const opDigests = digestsOf(bundle.operations)
  const workloadDigests = digestsOf(bundle.workloads)
  const implementationDigests = digestsOf(bundle.implementations)
  const runDigests = digestsOf(bundle.runs)
  const [
    existingOps,
    existingWorkloads,
    existingImplementations,
    existingRuns,
  ] = await Promise.all([
    existingDigests(database, schema.operations.semanticDigest, opDigests),
    existingDigests(database, schema.workloads.workloadDigest, workloadDigests),
    existingDigests(
      database,
      schema.implementations.implementationDigest,
      implementationDigests,
    ),
    existingDigests(database, schema.benchmarkRuns.runDigest, runDigests),
  ])
  const proposed: ProposedObject[] = []
  for (const [index, entry] of bundle.operations.entries()) {
    proposed.push({
      entity: "operation",
      name: entry.slug,
      digest: opDigests[index],
      action: existingOps.has(opDigests[index]) ? "exists" : "insert",
    })
  }
  for (const [index, entry] of bundle.workloads.entries()) {
    proposed.push({
      entity: "workload",
      name: entry.manifest.metadata.name,
      digest: workloadDigests[index],
      action: existingWorkloads.has(workloadDigests[index])
        ? "exists"
        : "insert",
    })
  }
  for (const [index, entry] of bundle.implementations.entries()) {
    proposed.push({
      entity: "implementation",
      name: entry.slug,
      digest: implementationDigests[index],
      action: existingImplementations.has(implementationDigests[index])
        ? "exists"
        : "insert",
    })
  }
  for (const [index, entry] of bundle.runs.entries()) {
    proposed.push({
      entity: "run",
      name: entry.manifest.metadata.name,
      digest: runDigests[index],
      action: existingRuns.has(runDigests[index]) ? "exists" : "insert",
    })
  }
  return proposed
}
