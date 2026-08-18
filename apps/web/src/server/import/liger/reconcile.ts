// Reconciliation (§14.4): curated CSV rows onto canonical identity. Every
// skipped row is counted by reason — uncurated kernel, unknown config
// shape, unknown provider, GPU, or mode — so the report states coverage
// instead of implying completeness (§20.3).
import { eq } from "drizzle-orm"
import type { DbHandle, ImportBundle } from "../../catalog/publication.ts"
import * as schema from "../../db/schema.ts"
import { specDigest } from "../../identity/digest.ts"
import { snapshotRow } from "../fetch.ts"
import { type ProposedObject, proposedObjects } from "../report.ts"
import type { LigerImportData } from "./discover.ts"
import { KERNELS_BY_NAME, MODES } from "./kernels.ts"
import {
  caseFromRow,
  caseKey,
  implementationFromProvider,
  ligerEnvironment,
  ligerProtocol,
  operationFromKernel,
  PROVIDERS,
  projectManifest,
  runFromRow,
} from "./normalize.ts"
import { LIGER_SOURCE, PARSER } from "./types.ts"

export type LigerImportReport = {
  source: string
  parserVersion: string
  revision: string
  discovered: { rows: number; speedRows: number; snapshots: number }
  /** Rows dropped, by reason; kernels list row counts per uncurated name. */
  skipped: {
    memoryRows: number
    uncuratedKernels: Record<string, number>
    unknownConfig: Record<string, number>
    unknownProvider: Record<string, number>
    unknownGpu: Record<string, number>
    duplicateRows: number
  }
  operationsByFamily: Record<string, number>
  proposed: ProposedObject[]
  ambiguities: string[]
  issues: { locator: string; item: string; problem: string }[]
  driftWarnings: string[]
  licenseWarnings: string[]
  plan: string
}

const count = (record: Record<string, number>, key: string) => {
  record[key] = (record[key] ?? 0) + 1
}

export async function reconcileLiger(
  database: DbHandle,
  data: LigerImportData,
): Promise<{ bundle: ImportBundle; report: LigerImportReport }> {
  const report: LigerImportReport = {
    source: LIGER_SOURCE.slug,
    parserVersion: PARSER.version,
    revision: data.commit,
    discovered: {
      rows: data.rows.length,
      speedRows: 0,
      snapshots: data.snapshots.length,
    },
    skipped: {
      memoryRows: 0,
      uncuratedKernels: {},
      unknownConfig: {},
      unknownProvider: {},
      unknownGpu: {},
      duplicateRows: 0,
    },
    operationsByFamily: {},
    proposed: [],
    ambiguities: [],
    issues: [...data.issues],
    driftWarnings: [...data.driftWarnings],
    licenseWarnings: [],
    plan: "",
  }
  const bundle: ImportBundle = {
    source: { ...LIGER_SOURCE },
    snapshots: data.snapshots.map((snapshot) => snapshotRow(snapshot, PARSER)),
    projects: [],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }

  const operationDigests = new Map<string, string>()
  const protocols = new Map<
    string,
    { manifest: ReturnType<typeof ligerProtocol>; digest: string }
  >()
  const environments = new Map<
    string,
    {
      manifest: NonNullable<ReturnType<typeof ligerEnvironment>>
      digest: string
    }
  >()
  const implementationDigests = new Map<string, string>()
  const caseDigests = new Map<string, string>()
  const seenProjects = new Set<string>()
  const seenRuns = new Set<string>()

  for (const row of data.rows) {
    if (row.metric_name !== "speed") {
      report.skipped.memoryRows++
      continue
    }
    report.discovered.speedRows++
    const spec = KERNELS_BY_NAME.get(row.kernel_name)
    if (!spec) {
      count(report.skipped.uncuratedKernels, row.kernel_name)
      continue
    }
    if (!(row.kernel_operation_mode in MODES)) {
      count(report.skipped.unknownConfig, row.kernel_name)
      continue
    }
    const provider = PROVIDERS[row.kernel_provider]
    if (!provider) {
      count(report.skipped.unknownProvider, row.kernel_provider)
      continue
    }
    const x = Number(row.x_value)
    let config: Record<string, unknown>
    try {
      config = JSON.parse(row.extra_benchmark_config_str)
    } catch {
      count(report.skipped.unknownConfig, row.kernel_name)
      continue
    }
    const binding =
      Number.isInteger(x) && x > 0 ? spec.bind(x, row.x_name, config) : null
    if (!binding) {
      count(report.skipped.unknownConfig, row.kernel_name)
      continue
    }

    let operationDigest = operationDigests.get(spec.csvName)
    if (!operationDigest) {
      const operation = operationFromKernel(spec, data.commit)
      operationDigest = specDigest(operation.manifest)
      operationDigests.set(spec.csvName, operationDigest)
      bundle.operations.push(operation)
      const family = operation.manifest.spec.family
      report.operationsByFamily[family] =
        (report.operationsByFamily[family] ?? 0) + 1
      const [slugRow] = await database
        .select({ semanticDigest: schema.operations.semanticDigest })
        .from(schema.operations)
        .where(eq(schema.operations.slug, operation.slug))
      if (slugRow && slugRow.semanticDigest !== operationDigest) {
        report.ambiguities.push(
          `operation slug '${operation.slug}' already maps to ${slugRow.semanticDigest}; import proposes ${operationDigest} — needs review`,
        )
      }
    }

    const environmentKey = row.gpu_name
    let environment = environments.get(environmentKey)
    if (!environment) {
      const manifest = ligerEnvironment(row.gpu_name)
      if (!manifest) {
        count(report.skipped.unknownGpu, row.gpu_name)
        continue
      }
      environment = { manifest, digest: specDigest(manifest) }
      environments.set(environmentKey, environment)
    }

    let protocol = protocols.get(row.kernel_operation_mode)
    if (!protocol) {
      const manifest = ligerProtocol(row.kernel_operation_mode)
      protocol = { manifest, digest: specDigest(manifest) }
      protocols.set(row.kernel_operation_mode, protocol)
    }

    const implementationKey = `${spec.csvName}/${row.kernel_provider}`
    let implementationDigest = implementationDigests.get(implementationKey)
    if (!implementationDigest) {
      const implementation = implementationFromProvider(
        spec,
        row.kernel_provider,
        operationDigest,
      )
      if (!implementation) throw new Error("unreachable: provider checked")
      implementationDigest = specDigest(implementation.manifest)
      implementationDigests.set(implementationKey, implementationDigest)
      if (!seenProjects.has(implementation.projectSlug)) {
        seenProjects.add(implementation.projectSlug)
        bundle.projects.push(projectManifest(provider.projectSlug))
      }
      bundle.implementations.push(implementation)
    }

    const workloadKey = `${spec.csvName}/${caseKey(binding)}`
    let workloadDigest = caseDigests.get(workloadKey)
    if (!workloadDigest) {
      const manifest = caseFromRow(spec, operationDigest, binding)
      workloadDigest = specDigest(manifest)
      caseDigests.set(workloadKey, workloadDigest)
      bundle.workloads.push({ manifest, externalId: workloadKey })
    }

    try {
      const run = runFromRow({
        row,
        spec,
        binding,
        implementationDigest,
        workloadDigest,
        protocol: protocol.manifest,
        protocolDigest: protocol.digest,
        environment: environment.manifest,
        environmentDigest: environment.digest,
      })
      if (seenRuns.has(run.externalId)) {
        report.skipped.duplicateRows++
        continue
      }
      seenRuns.add(run.externalId)
      bundle.runs.push(run)
    } catch (error) {
      report.issues.push({
        locator: "normalize",
        item: `${spec.csvName}/${row.kernel_provider}/${row.x_value}`,
        problem: (error as Error).message,
      })
    }
  }

  report.proposed = await proposedObjects(database, bundle)
  const inserts = report.proposed.filter(
    (object) => object.action === "insert",
  ).length
  report.plan = `publish ${inserts} new objects (${report.proposed.length - inserts} already present) into source '${LIGER_SOURCE.slug}' via the idempotent publication transaction`
  return { bundle, report }
}
