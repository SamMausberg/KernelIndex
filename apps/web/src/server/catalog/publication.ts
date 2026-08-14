// The idempotent publication transaction (§10.8): the only write path into
// the public catalog. Canonical objects are resolved by content digest and
// source identity; re-publishing an unchanged bundle inserts nothing. Runs
// are append-only; this module never updates a published row.
import { and, eq, inArray } from "drizzle-orm"
import type {
  AnyManifest,
  BenchmarkProtocolManifest,
  BenchmarkRunManifest,
  ExecutionEnvironmentManifest,
  ImplementationRevisionManifest,
  OperationSpecManifest,
  SoftwareProjectManifest,
  WorkloadCaseManifest,
} from "../../schemas/kinds.ts"
import { API_VERSION } from "../../schemas/kinds.ts"
import { parseManifestDocument } from "../../schemas/parse.ts"
import type { Db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { type Digest, specDigest } from "../identity/digest.ts"
import {
  comparisonKey,
  correctnessKey,
  metricKey,
} from "../policy/comparison.ts"
import { concludeLicense } from "../policy/licensing.ts"

export type BundleArtifact = {
  role: string
  kind: string
  mediaType: string
  digest: Digest
  uri?: string
  sizeBytes?: number
  storage: "upstream" | "inline" | "object"
}

export type ImportBundle = {
  source: { slug: string; kind: string; name: string; policy?: unknown }
  snapshots?: {
    locator: string
    resolvedLocator?: string
    contentDigest: Digest
    mediaType?: string
    sizeBytes?: number
    body?: string
    httpMetadata?: unknown
    parserName: string
    parserVersion: string
    observedAt: Date
    fetchedAt: Date
  }[]
  projects: {
    manifest: SoftwareProjectManifest
    slug: string
    externalId?: string
  }[]
  operations: {
    manifest: OperationSpecManifest
    slug: string
    aliases?: string[]
    externalId?: string
  }[]
  workloads: { manifest: WorkloadCaseManifest; externalId?: string }[]
  implementations: {
    manifest: ImplementationRevisionManifest
    slug: string
    projectSlug: string
    externalId?: string
  }[]
  runs: {
    manifest: BenchmarkRunManifest
    protocol: BenchmarkProtocolManifest
    environment: ExecutionEnvironmentManifest
    externalId?: string
    artifacts?: BundleArtifact[]
  }[]
}

export type EntityCounts = { inserted: number; existing: number }
export type PublicationResult = {
  sourceId: string
  counts: Record<
    | "snapshots"
    | "projects"
    | "operations"
    | "workloads"
    | "implementations"
    | "runs",
    EntityCounts
  >
  runIds: string[]
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

// Revalidation inside the transaction (§10.8 step 2): never trust that a
// caller's manifest object still matches its claimed kind and schema.
function revalidated<M extends AnyManifest>(manifest: M): M {
  const parsed = parseManifestDocument(manifest)
  if (parsed.kind !== manifest.kind)
    throw new Error(`manifest kind changed during revalidation`)
  return parsed as M
}

function summarizeShape(workload: WorkloadCaseManifest): string {
  const tensors = Object.values(workload.spec.tensors)
  return tensors.length > 0 ? `[${tensors[0].shape.join(", ")}]` : "[]"
}

function layoutKeyOf(tensor: { shape: number[]; strides?: number[] }): string {
  if (!tensor.strides) return "contiguous"
  const contiguous = tensor.shape.reduceRight<{ next: number; ok: boolean }>(
    (acc, dim, i) => ({
      next: acc.next * dim,
      ok: acc.ok && tensor.strides?.[i] === acc.next,
    }),
    { next: 1, ok: true },
  ).ok
  return contiguous ? "row_major" : "strided"
}

async function linkSource(
  tx: Tx,
  sourceId: string,
  entityKind: string,
  entityId: string,
  externalId: string | undefined,
) {
  if (externalId === undefined) return
  await tx
    .insert(schema.sourceLinks)
    .values({ sourceId, entityKind, entityId, externalId })
    .onConflictDoNothing()
}

/** Publish one validated bundle atomically. Safe to re-run with same input. */
export async function publishBundle(
  database: Db,
  bundle: ImportBundle,
  options: { publish: boolean },
): Promise<PublicationResult> {
  return database.transaction(async (tx) => {
    const counts: PublicationResult["counts"] = {
      snapshots: { inserted: 0, existing: 0 },
      projects: { inserted: 0, existing: 0 },
      operations: { inserted: 0, existing: 0 },
      workloads: { inserted: 0, existing: 0 },
      implementations: { inserted: 0, existing: 0 },
      runs: { inserted: 0, existing: 0 },
    }

    // Source registration.
    await tx
      .insert(schema.sources)
      .values({ ...bundle.source, policy: bundle.source.policy ?? null })
      .onConflictDoNothing()
    const [source] = await tx
      .select()
      .from(schema.sources)
      .where(eq(schema.sources.slug, bundle.source.slug))

    // Immutable source snapshots, deduplicated by content and locator (§14.3).
    for (const snapshot of bundle.snapshots ?? []) {
      const existing = await tx
        .select({ id: schema.sourceSnapshots.id })
        .from(schema.sourceSnapshots)
        .where(
          and(
            eq(schema.sourceSnapshots.sourceId, source.id),
            eq(schema.sourceSnapshots.contentDigest, snapshot.contentDigest),
            eq(schema.sourceSnapshots.locator, snapshot.locator),
          ),
        )
      if (existing.length > 0) {
        counts.snapshots.existing++
        continue
      }
      await tx
        .insert(schema.sourceSnapshots)
        .values({ ...snapshot, sourceId: source.id })
      counts.snapshots.inserted++
    }

    // Projects are mutable metadata resolved by slug; existing rows win.
    const projectIdBySlug = new Map<string, string>()
    for (const project of bundle.projects) {
      const manifest = revalidated(project.manifest)
      const [existing] = await tx
        .select()
        .from(schema.projects)
        .where(eq(schema.projects.slug, project.slug))
      if (existing) {
        projectIdBySlug.set(project.slug, existing.id)
        counts.projects.existing++
      } else {
        const [row] = await tx
          .insert(schema.projects)
          .values({
            slug: project.slug,
            name: manifest.spec.name,
            normalizedName: manifest.spec.name.toLowerCase(),
            canonicalUrl:
              manifest.spec.repository ?? manifest.spec.homepage ?? null,
            manifest,
          })
          .returning()
        projectIdBySlug.set(project.slug, row.id)
        counts.projects.inserted++
      }
      await linkSource(
        tx,
        source.id,
        "project",
        projectIdBySlug.get(project.slug) as string,
        project.externalId,
      )
    }

    // Operations, resolved by semantic digest; a slug may never silently
    // point at different semantics (§14.4).
    const operationIdByDigest = new Map<string, string>()
    for (const operation of bundle.operations) {
      const manifest = revalidated(operation.manifest)
      const digest = specDigest(manifest)
      let [row] = await tx
        .select()
        .from(schema.operations)
        .where(eq(schema.operations.semanticDigest, digest))
      if (row) {
        counts.operations.existing++
      } else {
        const [slugTaken] = await tx
          .select({ semanticDigest: schema.operations.semanticDigest })
          .from(schema.operations)
          .where(eq(schema.operations.slug, operation.slug))
        if (slugTaken) {
          throw new Error(
            `operation slug '${operation.slug}' already maps to ${slugTaken.semanticDigest}; superseding requires review`,
          )
        }
        ;[row] = await tx
          .insert(schema.operations)
          .values({
            slug: operation.slug,
            family: manifest.spec.family,
            name: manifest.metadata.title ?? operation.slug,
            schemaVersion: API_VERSION,
            semanticDigest: digest,
            manifest,
          })
          .returning()
        counts.operations.inserted++
      }
      operationIdByDigest.set(digest, row.id)
      for (const alias of operation.aliases ?? []) {
        await tx
          .insert(schema.operationAliases)
          .values({ operationId: row.id, alias: alias.toLowerCase() })
          .onConflictDoNothing()
      }
      await linkSource(tx, source.id, "operation", row.id, operation.externalId)
    }

    async function operationIdFor(digest: string): Promise<string> {
      const known = operationIdByDigest.get(digest)
      if (known) return known
      const [row] = await tx
        .select({ id: schema.operations.id })
        .from(schema.operations)
        .where(eq(schema.operations.semanticDigest, digest))
      if (!row)
        throw new Error(`operation ${digest} is not in the bundle or catalog`)
      operationIdByDigest.set(digest, row.id)
      return row.id
    }

    // Workloads by content digest.
    const workloadRowByDigest = new Map<
      string,
      { id: string; operationDigest: string; manifest: WorkloadCaseManifest }
    >()
    for (const workload of bundle.workloads) {
      const manifest = revalidated(workload.manifest)
      const digest = specDigest(manifest)
      let [row] = await tx
        .select()
        .from(schema.workloads)
        .where(eq(schema.workloads.workloadDigest, digest))
      if (row) {
        counts.workloads.existing++
      } else {
        const tensors = Object.values(manifest.spec.tensors)
        ;[row] = await tx
          .insert(schema.workloads)
          .values({
            operationId: await operationIdFor(
              manifest.spec.operationSpecDigest,
            ),
            workloadDigest: digest,
            schemaVersion: API_VERSION,
            manifest,
            shapeSummary: summarizeShape(manifest),
            dtypes: [...new Set(tensors.map((t) => t.dtype))].sort(),
            layoutKeys: [...new Set(tensors.map(layoutKeyOf))].sort(),
          })
          .returning()
        counts.workloads.inserted++
      }
      workloadRowByDigest.set(digest, {
        id: row.id,
        operationDigest: manifest.spec.operationSpecDigest,
        manifest,
      })
      await linkSource(tx, source.id, "workload", row.id, workload.externalId)
    }

    // Implementation revisions by content digest.
    const implementationRowByDigest = new Map<
      string,
      {
        id: string
        sourceAvailable: boolean
        installable: boolean
        license: string | null
      }
    >()
    for (const implementation of bundle.implementations) {
      const manifest = revalidated(implementation.manifest)
      const digest = specDigest(manifest)
      let [row] = await tx
        .select()
        .from(schema.implementations)
        .where(eq(schema.implementations.implementationDigest, digest))
      if (row) {
        counts.implementations.existing++
      } else {
        const projectId = projectIdBySlug.get(implementation.projectSlug)
        if (!projectId) {
          throw new Error(
            `implementation ${implementation.slug}: unknown project '${implementation.projectSlug}'`,
          )
        }
        const licensing = manifest.spec.licensing
        const license = concludeLicense(
          licensing.concluded ?? licensing.declared,
        )
        ;[row] = await tx
          .insert(schema.implementations)
          .values({
            projectId,
            operationId: await operationIdFor(
              manifest.spec.operation.specDigest,
            ),
            slug: implementation.slug,
            implementationDigest: digest,
            sourceRevision:
              manifest.spec.projectRevision.commit ??
              manifest.spec.projectRevision.version ??
              null,
            language: manifest.spec.callable.language,
            framework: manifest.spec.callable.interface ?? null,
            targetArchitectures: manifest.spec.support.hardwareArchitectures,
            licenseExpression: license.concluded,
            sourceAvailable:
              manifest.spec.projectRevision.repository !== undefined,
            installable: (manifest.spec.buildVariants ?? []).length > 0,
            manifest,
          })
          .returning()
        counts.implementations.inserted++
      }
      implementationRowByDigest.set(digest, {
        id: row.id,
        sourceAvailable: row.sourceAvailable,
        installable: row.installable,
        license: row.licenseExpression,
      })
      await linkSource(
        tx,
        source.id,
        "implementation",
        row.id,
        implementation.externalId,
      )
    }

    async function implementationFor(digest: string) {
      const known = implementationRowByDigest.get(digest)
      if (known) return known
      const [row] = await tx
        .select()
        .from(schema.implementations)
        .where(eq(schema.implementations.implementationDigest, digest))
      if (!row)
        throw new Error(
          `implementation ${digest} is not in the bundle or catalog`,
        )
      return {
        id: row.id,
        sourceAvailable: row.sourceAvailable,
        installable: row.installable,
        license: row.licenseExpression,
      }
    }

    async function workloadFor(digest: string) {
      const known = workloadRowByDigest.get(digest)
      if (known) return known
      const [row] = await tx
        .select()
        .from(schema.workloads)
        .where(eq(schema.workloads.workloadDigest, digest))
      if (!row)
        throw new Error(`workload ${digest} is not in the bundle or catalog`)
      const manifest = row.manifest as WorkloadCaseManifest
      return {
        id: row.id,
        operationDigest: manifest.spec.operationSpecDigest,
        manifest,
      }
    }

    // Append-only benchmark runs (§10.7).
    const runIds: string[] = []
    for (const run of bundle.runs) {
      const manifest = revalidated(run.manifest)
      const protocol = revalidated(run.protocol)
      const environment = revalidated(run.environment)
      const runDigest = specDigest(manifest)
      const [existing] = await tx
        .select({ id: schema.benchmarkRuns.id })
        .from(schema.benchmarkRuns)
        .where(eq(schema.benchmarkRuns.runDigest, runDigest))
      if (existing) {
        counts.runs.existing++
        runIds.push(existing.id)
        continue
      }

      const protocolKey = specDigest(protocol)
      const environmentKey = specDigest(environment)
      if (protocolKey !== manifest.spec.protocolDigest) {
        throw new Error(
          `run ${manifest.metadata.name}: protocol digest mismatch`,
        )
      }
      if (environmentKey !== manifest.spec.environmentDigest) {
        throw new Error(
          `run ${manifest.metadata.name}: environment digest mismatch`,
        )
      }
      const implementation = await implementationFor(
        manifest.spec.implementationDigest,
      )
      const workload = await workloadFor(manifest.spec.workloadDigest)
      const runCorrectnessKey = correctnessKey(
        workload.manifest.spec.correctness,
      )

      const timing = manifest.spec.timing
      const firstMeasurement = manifest.spec.measurements?.[0]
      const primary = timing
        ? {
            metric: "latency",
            statistic: timing.primaryStatistic,
            unit: "ns",
            value: timing.latencyNs.median,
            sampleCount: timing.samples ?? null,
          }
        : firstMeasurement
          ? {
              metric: firstMeasurement.metric,
              statistic: firstMeasurement.statistic,
              unit: firstMeasurement.unit,
              value: firstMeasurement.value,
              sampleCount: firstMeasurement.sampleCount ?? null,
            }
          : null
      if (manifest.spec.status === "passed" && options.publish && !primary) {
        throw new Error(
          `run ${manifest.metadata.name}: a published passed run needs a primary measurement`,
        )
      }

      const hardware = environment.spec.hardware
      const driverMajor = Number.parseInt(
        environment.spec.software.driver ?? "",
        10,
      )
      const cudaMajor = Number.parseInt(
        environment.spec.software.cudaToolkit ?? "",
        10,
      )

      const [row] = await tx
        .insert(schema.benchmarkRuns)
        .values({
          runDigest,
          implementationId: implementation.id,
          workloadId: workload.id,
          sourceId: source.id,
          status: manifest.spec.status,
          observedAt: new Date(manifest.spec.observedAt),
          publishedAt: options.publish ? new Date() : null,
          hardwareVendor: hardware.vendor,
          hardwareModel: hardware.product,
          hardwareArchitecture: hardware.architecture,
          driverMajor: Number.isNaN(driverMajor) ? null : driverMajor,
          cudaMajor: Number.isNaN(cudaMajor) ? null : cudaMajor,
          protocolKey,
          environmentKey,
          correctnessKey: runCorrectnessKey,
          comparisonKey: comparisonKey({
            operationDigest: workload.operationDigest,
            workloadDigest: manifest.spec.workloadDigest,
            protocolKey,
            environmentKey,
            correctnessKey: runCorrectnessKey,
            metricKey: primary
              ? metricKey(primary.metric, primary.statistic, primary.unit)
              : "none",
          }),
          primaryMetric: primary?.metric ?? "none",
          primaryValue: primary?.value ?? null,
          primaryUnit: primary?.unit ?? null,
          sampleCount: primary?.sampleCount ?? null,
          uncertaintyLow: timing?.latencyNs.confidence95?.[0] ?? null,
          uncertaintyHigh: timing?.latencyNs.confidence95?.[1] ?? null,
          reported: true,
          sourceAvailable: implementation.sourceAvailable,
          installable: implementation.installable,
          licenseExpression: implementation.license,
          manifest: { run: manifest, protocol, environment },
        })
        .returning()
      counts.runs.inserted++
      runIds.push(row.id)
      await linkSource(tx, source.id, "run", row.id, run.externalId)

      // Expand timing statistics and secondary measurements into typed rows.
      const measurementRows: (typeof schema.measurements.$inferInsert)[] = []
      if (timing) {
        const stats: [string, number | undefined][] = [
          ["median", timing.latencyNs.median],
          ["p05", timing.latencyNs.p05],
          ["p95", timing.latencyNs.p95],
          ["min", timing.latencyNs.minimum],
          ["max", timing.latencyNs.maximum],
          ["mad", timing.latencyNs.mad],
        ]
        for (const [statistic, value] of stats) {
          if (value !== undefined) {
            measurementRows.push({
              runId: row.id,
              metric: "latency",
              statistic,
              unit: "ns",
              value,
              sampleCount: timing.samples ?? null,
            })
          }
        }
      }
      for (const extra of manifest.spec.measurements ?? []) {
        measurementRows.push({
          runId: row.id,
          metric: extra.metric,
          statistic: extra.statistic,
          unit: extra.unit,
          value: extra.value,
          sampleCount: extra.sampleCount ?? null,
        })
      }
      if (measurementRows.length > 0) {
        await tx
          .insert(schema.measurements)
          .values(measurementRows)
          .onConflictDoNothing()
      }

      for (const artifact of run.artifacts ?? []) {
        await tx
          .insert(schema.artifacts)
          .values({
            contentDigest: artifact.digest,
            kind: artifact.kind,
            mediaType: artifact.mediaType,
            sizeBytes: artifact.sizeBytes ?? null,
            storage: artifact.storage,
            uri: artifact.uri ?? null,
          })
          .onConflictDoNothing()
        const [artifactRow] = await tx
          .select({ id: schema.artifacts.id })
          .from(schema.artifacts)
          .where(eq(schema.artifacts.contentDigest, artifact.digest))
        await tx
          .insert(schema.runArtifacts)
          .values({
            runId: row.id,
            artifactId: artifactRow.id,
            role: artifact.role,
          })
          .onConflictDoNothing()
      }
    }

    return { sourceId: source.id, counts, runIds }
  })
}

/** True when every listed run digest already exists (used by --dry-run). */
export async function existingRunDigests(
  database: Db,
  digests: string[],
): Promise<Set<string>> {
  if (digests.length === 0) return new Set()
  const rows = await database
    .select({ runDigest: schema.benchmarkRuns.runDigest })
    .from(schema.benchmarkRuns)
    .where(inArray(schema.benchmarkRuns.runDigest, digests))
  return new Set(rows.map((row) => row.runDigest))
}
