// The idempotent publication transaction (§10.8): the only write path into
// the public catalog. Canonical objects are resolved by content digest and
// source identity; re-publishing an unchanged bundle inserts nothing. Runs
// are append-only; this module never updates a published row.
//
// Writes are set-based: one chunked existence query and one chunked
// multi-row insert per entity type, so a bundle of N runs costs O(N/CHUNK)
// database round trips instead of O(N) — minutes instead of hours against
// a remote database. Validation that used to run per row (slug conflicts,
// digest mismatches, missing references) runs in memory against the
// prefetched maps, with identical errors.
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
  WorkloadSuiteManifest,
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
import { syncRecordEvents } from "./record-events.ts"

export type BundleArtifact = {
  role: string
  kind: string
  mediaType: string
  digest: Digest
  uri?: string
  sizeBytes?: number
  storage: "upstream" | "inline" | "object"
  /** Inline body for storage='inline' (e.g. mirrored kernel source). */
  content?: string
  /** KernelIndex's right to display/redistribute this artifact (SPDX-ish). */
  license?: string
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
    /** Editorial taxonomy tags (§8.2); mutable, never digest-bearing. */
    tags?: string[]
    externalId?: string
  }[]
  workloads: { manifest: AnyWorkloadManifest; externalId?: string }[]
  implementations: {
    manifest: ImplementationRevisionManifest
    slug: string
    projectSlug: string
    externalId?: string
    /** Source artifacts referenced by manifest.spec.source (no run link). */
    artifacts?: BundleArtifact[]
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
/** Callers may pass a live transaction; nested calls use savepoints. */
export type DbHandle = Db | Tx

/** Rows per statement: bounded parameter counts, few round trips. */
const CHUNK = 500

/** One query per ≤CHUNK-slice of `values`, results concatenated. */
export async function inChunks<V, R>(
  values: V[],
  query: (slice: V[]) => Promise<R[]>,
): Promise<R[]> {
  const rows: R[] = []
  for (let start = 0; start < values.length; start += CHUNK) {
    rows.push(...(await query(values.slice(start, start + CHUNK))))
  }
  return rows
}

/** One statement per ≤CHUNK-slice of `rows` (inserts without RETURNING). */
export async function perChunk<V>(
  rows: V[],
  statement: (slice: V[]) => Promise<unknown>,
): Promise<void> {
  for (let start = 0; start < rows.length; start += CHUNK) {
    await statement(rows.slice(start, start + CHUNK))
  }
}

/** First entry per key wins; later duplicates are dropped. */
export function uniqueBy<V>(entries: V[], key: (entry: V) => string): V[] {
  const seen = new Set<string>()
  return entries.filter((entry) => {
    if (seen.has(key(entry))) return false
    seen.add(key(entry))
    return true
  })
}

/**
 * Resolve entries against the catalog by content key: fetch what exists
 * (chunked), insert what doesn't via `insert` (which receives every missing
 * entry at once and chunks its own statements), and account inserted vs
 * existing — duplicates within the bundle count as existing, exactly like
 * the per-row transaction did.
 */
export async function resolveByKey<E, R>(options: {
  entries: E[]
  key: (entry: E) => string
  fetch: (slice: string[]) => Promise<R[]>
  rowKey: (row: R) => string
  insert: (missing: E[]) => Promise<R[]>
  counts?: EntityCounts
}): Promise<Map<string, R>> {
  const unique = uniqueBy(options.entries, options.key)
  const map = new Map(
    (await inChunks(unique.map(options.key), options.fetch)).map((row) => [
      options.rowKey(row),
      row,
    ]),
  )
  const missing = unique.filter((entry) => !map.has(options.key(entry)))
  for (const row of await options.insert(missing)) {
    map.set(options.rowKey(row), row)
  }
  if (options.counts) {
    options.counts.inserted += missing.length
    options.counts.existing += options.entries.length - missing.length
  }
  return map
}

// Revalidation inside the transaction (§10.8 step 2): never trust that a
// caller's manifest object still matches its claimed kind and schema.
function revalidated<M extends AnyManifest>(manifest: M): M {
  const parsed = parseManifestDocument(manifest)
  if (parsed.kind !== manifest.kind)
    throw new Error(`manifest kind changed during revalidation`)
  return parsed as M
}

/** A run can bind an exact case or a source-defined suite (§11.7). */
export type AnyWorkloadManifest = WorkloadCaseManifest | WorkloadSuiteManifest

function summarizeShape(workload: AnyWorkloadManifest): string {
  if (workload.kind === "WorkloadSuite")
    return `suite of ${workload.spec.cases.length} cases`
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

/**
 * Register the bundle's source and refresh its mutable policy (§14.10),
 * then insert the source snapshots that are new for it (§14.3). Shared with
 * serving publication.
 */
export async function publishSourceAndSnapshots(
  tx: Tx,
  bundle: Pick<ImportBundle, "source" | "snapshots">,
  snapshotCounts: EntityCounts,
) {
  await tx
    .insert(schema.sources)
    .values({ ...bundle.source, policy: bundle.source.policy ?? null })
    .onConflictDoNothing()
  const [source] = await tx
    .select()
    .from(schema.sources)
    .where(eq(schema.sources.slug, bundle.source.slug))
  if (
    bundle.source.policy !== undefined &&
    JSON.stringify(bundle.source.policy) !== JSON.stringify(source.policy)
  ) {
    await tx
      .update(schema.sources)
      .set({ policy: bundle.source.policy })
      .where(eq(schema.sources.id, source.id))
  }

  const snapshotKey = (s: { contentDigest: string; locator: string }) =>
    `${s.contentDigest} ${s.locator}`
  const snapshots = uniqueBy(bundle.snapshots ?? [], snapshotKey)
  const existing = new Set(
    (
      await inChunks(
        snapshots.map((s) => s.contentDigest),
        (slice) =>
          tx
            .select({
              contentDigest: schema.sourceSnapshots.contentDigest,
              locator: schema.sourceSnapshots.locator,
            })
            .from(schema.sourceSnapshots)
            .where(
              and(
                eq(schema.sourceSnapshots.sourceId, source.id),
                inArray(schema.sourceSnapshots.contentDigest, slice),
              ),
            ),
      )
    ).map(snapshotKey),
  )
  const fresh = snapshots.filter((s) => !existing.has(snapshotKey(s)))
  await perChunk(fresh, (slice) =>
    tx
      .insert(schema.sourceSnapshots)
      .values(slice.map((s) => ({ ...s, sourceId: source.id }))),
  )
  snapshotCounts.inserted += fresh.length
  snapshotCounts.existing += (bundle.snapshots ?? []).length - fresh.length
  return source
}

/** Resolve mutable projects by slug; existing rows win. Shared with serving. */
export async function resolveProjects(
  tx: Tx,
  projects: { manifest: SoftwareProjectManifest; slug: string }[],
  counts: EntityCounts,
): Promise<Map<string, { id: string; slug: string }>> {
  return resolveByKey({
    entries: projects.map((entry) => ({
      ...entry,
      manifest: revalidated(entry.manifest),
    })),
    key: (entry) => entry.slug,
    fetch: (slice) =>
      tx
        .select({ id: schema.projects.id, slug: schema.projects.slug })
        .from(schema.projects)
        .where(inArray(schema.projects.slug, slice)),
    rowKey: (row) => row.slug,
    insert: (missing) =>
      inChunks(missing, (slice) =>
        tx
          .insert(schema.projects)
          .values(
            slice.map(({ slug, manifest }) => ({
              slug,
              name: manifest.spec.name,
              normalizedName: manifest.spec.name.toLowerCase(),
              canonicalUrl:
                manifest.spec.repository ?? manifest.spec.homepage ?? null,
              manifest,
            })),
          )
          .returning({ id: schema.projects.id, slug: schema.projects.slug }),
      ),
    counts,
  })
}

/** Publish one validated bundle atomically. Safe to re-run with same input. */
export async function publishBundle(
  database: DbHandle,
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
    /** Deferred source_links rows, inserted in one chunked pass. */
    const sourceLinkRows: (typeof schema.sourceLinks.$inferInsert)[] = []
    const linkSource = (
      entityKind: string,
      entityId: string,
      externalId: string | undefined,
    ) => {
      if (externalId !== undefined)
        sourceLinkRows.push({
          sourceId: source.id,
          entityKind,
          entityId,
          externalId,
        })
    }

    const source = await publishSourceAndSnapshots(tx, bundle, counts.snapshots)

    const projectIdBySlug = await resolveProjects(
      tx,
      bundle.projects,
      counts.projects,
    )
    for (const entry of bundle.projects) {
      linkSource(
        "project",
        (projectIdBySlug.get(entry.slug) as { id: string }).id,
        entry.externalId,
      )
    }

    // Operations, resolved by semantic digest; a slug may never silently
    // point at different semantics (§14.4).
    const operations = bundle.operations.map((entry) => {
      const manifest = revalidated(entry.manifest)
      return { ...entry, manifest, digest: specDigest(manifest) }
    })
    let insertedOperationDigests = new Set<string>()
    const operationRowByDigest = await resolveByKey({
      entries: operations,
      key: (entry) => entry.digest,
      fetch: (slice) =>
        tx
          .select({
            id: schema.operations.id,
            semanticDigest: schema.operations.semanticDigest,
            tags: schema.operations.tags,
          })
          .from(schema.operations)
          .where(inArray(schema.operations.semanticDigest, slice as Digest[])),
      rowKey: (row) => row.semanticDigest,
      insert: async (missing) => {
        const [taken] = await inChunks(
          missing.map((entry) => entry.slug),
          (slice) =>
            tx
              .select({
                slug: schema.operations.slug,
                semanticDigest: schema.operations.semanticDigest,
              })
              .from(schema.operations)
              .where(inArray(schema.operations.slug, slice)),
        )
        if (taken) {
          throw new Error(
            `operation slug '${taken.slug}' already maps to ${taken.semanticDigest}; superseding requires review`,
          )
        }
        insertedOperationDigests = new Set(missing.map((e) => e.digest))
        return inChunks(missing, (slice) =>
          tx
            .insert(schema.operations)
            .values(
              slice.map((entry) => ({
                slug: entry.slug,
                family: entry.manifest.spec.family,
                name: entry.manifest.metadata.title ?? entry.slug,
                schemaVersion: API_VERSION,
                semanticDigest: entry.digest,
                manifest: entry.manifest,
                tags: entry.tags ?? [],
              })),
            )
            .returning({
              id: schema.operations.id,
              semanticDigest: schema.operations.semanticDigest,
              tags: schema.operations.tags,
            }),
        )
      },
      counts: counts.operations,
    })
    const aliasRows: (typeof schema.operationAliases.$inferInsert)[] = []
    for (const entry of operations) {
      const row = operationRowByDigest.get(entry.digest) as {
        id: string
        tags: string[]
      }
      // Tags are editorial metadata: refresh them without touching identity.
      const tags = entry.tags ?? []
      if (
        !insertedOperationDigests.has(entry.digest) &&
        tags.length > 0 &&
        JSON.stringify(tags) !== JSON.stringify(row.tags)
      ) {
        await tx
          .update(schema.operations)
          .set({ tags })
          .where(eq(schema.operations.id, row.id))
      }
      for (const alias of entry.aliases ?? []) {
        aliasRows.push({ operationId: row.id, alias: alias.toLowerCase() })
      }
      linkSource("operation", row.id, entry.externalId)
    }
    await perChunk(aliasRows, (slice) =>
      tx.insert(schema.operationAliases).values(slice).onConflictDoNothing(),
    )

    const operationIdByDigest = new Map(
      [...operationRowByDigest].map(([digest, row]) => [digest, row.id]),
    )
    /** Load operations referenced by digest but absent from the bundle. */
    const resolveOperationIds = async (digests: string[]) => {
      const missing = [
        ...new Set(digests.filter((d) => !operationIdByDigest.has(d))),
      ] as Digest[]
      for (const row of await inChunks(missing, (slice) =>
        tx
          .select({
            id: schema.operations.id,
            semanticDigest: schema.operations.semanticDigest,
          })
          .from(schema.operations)
          .where(inArray(schema.operations.semanticDigest, slice)),
      )) {
        operationIdByDigest.set(row.semanticDigest, row.id)
      }
    }
    const operationIdFor = (digest: string): string => {
      const id = operationIdByDigest.get(digest)
      if (!id)
        throw new Error(`operation ${digest} is not in the bundle or catalog`)
      return id
    }

    // Workloads by content digest.
    const workloads = bundle.workloads.map((entry) => {
      const manifest = revalidated(entry.manifest)
      return { ...entry, manifest, digest: specDigest(manifest) }
    })
    const workloadIdByDigest = new Map(
      [
        ...(await resolveByKey({
          entries: workloads,
          key: (entry) => entry.digest,
          fetch: (slice) =>
            tx
              .select({
                id: schema.workloads.id,
                workloadDigest: schema.workloads.workloadDigest,
              })
              .from(schema.workloads)
              .where(
                inArray(schema.workloads.workloadDigest, slice as Digest[]),
              ),
          rowKey: (row) => row.workloadDigest,
          insert: async (missing) => {
            await resolveOperationIds(
              missing.map((entry) => entry.manifest.spec.operationSpecDigest),
            )
            return inChunks(missing, (slice) =>
              tx
                .insert(schema.workloads)
                .values(
                  slice.map((entry) => {
                    const tensors =
                      entry.manifest.kind === "WorkloadCase"
                        ? Object.values(entry.manifest.spec.tensors)
                        : []
                    return {
                      operationId: operationIdFor(
                        entry.manifest.spec.operationSpecDigest,
                      ),
                      workloadDigest: entry.digest,
                      schemaVersion: API_VERSION,
                      manifest: entry.manifest,
                      shapeSummary: summarizeShape(entry.manifest),
                      dtypes: [...new Set(tensors.map((t) => t.dtype))].sort(),
                      layoutKeys: [...new Set(tensors.map(layoutKeyOf))].sort(),
                    }
                  }),
                )
                .returning({
                  id: schema.workloads.id,
                  workloadDigest: schema.workloads.workloadDigest,
                }),
            )
          },
          counts: counts.workloads,
        })),
      ].map(([digest, row]) => [digest, row.id]),
    )
    const workloadRowByDigest = new Map<
      string,
      { id: string; operationDigest: string; manifest: AnyWorkloadManifest }
    >(
      uniqueBy(workloads, (entry) => entry.digest).map((entry) => [
        entry.digest,
        {
          id: workloadIdByDigest.get(entry.digest) as string,
          operationDigest: entry.manifest.spec.operationSpecDigest,
          manifest: entry.manifest,
        },
      ]),
    )
    for (const entry of workloads) {
      linkSource(
        "workload",
        workloadIdByDigest.get(entry.digest) as string,
        entry.externalId,
      )
    }

    // Implementation revisions by content digest.
    const implementations = bundle.implementations.map((entry) => {
      const manifest = revalidated(entry.manifest)
      return { ...entry, manifest, digest: specDigest(manifest) }
    })
    const implementationColumns = {
      id: schema.implementations.id,
      implementationDigest: schema.implementations.implementationDigest,
      sourceAvailable: schema.implementations.sourceAvailable,
      installable: schema.implementations.installable,
      licenseExpression: schema.implementations.licenseExpression,
    }
    const fetchImplementations = (slice: string[]) =>
      tx
        .select(implementationColumns)
        .from(schema.implementations)
        .where(
          inArray(
            schema.implementations.implementationDigest,
            slice as Digest[],
          ),
        )
    const implementationRowByDigest = await resolveByKey({
      entries: implementations,
      key: (entry) => entry.digest,
      fetch: fetchImplementations,
      rowKey: (row) => row.implementationDigest,
      insert: async (missing) => {
        await resolveOperationIds(
          missing.map((entry) => entry.manifest.spec.operation.specDigest),
        )
        return inChunks(missing, (slice) =>
          tx
            .insert(schema.implementations)
            .values(
              slice.map((entry) => {
                const project = projectIdBySlug.get(entry.projectSlug)
                if (!project) {
                  throw new Error(
                    `implementation ${entry.slug}: unknown project '${entry.projectSlug}'`,
                  )
                }
                const manifest = entry.manifest
                const licensing = manifest.spec.licensing
                const license = concludeLicense(
                  licensing.concluded ?? licensing.declared,
                )
                return {
                  projectId: project.id,
                  operationId: operationIdFor(
                    manifest.spec.operation.specDigest,
                  ),
                  slug: entry.slug,
                  implementationDigest: entry.digest,
                  sourceRevision:
                    manifest.spec.projectRevision.commit ??
                    manifest.spec.projectRevision.version ??
                    null,
                  language: manifest.spec.callable.language,
                  framework: manifest.spec.callable.interface ?? null,
                  targetArchitectures:
                    manifest.spec.support.hardwareArchitectures,
                  licenseExpression: license.concluded,
                  sourceAvailable:
                    manifest.spec.projectRevision.repository !== undefined ||
                    manifest.spec.source !== undefined,
                  installable: (manifest.spec.buildVariants ?? []).length > 0,
                  title: manifest.metadata.title ?? null,
                  installKind:
                    manifest.spec.buildVariants?.[0]?.install.kind ?? null,
                  installCommand:
                    manifest.spec.buildVariants?.[0]?.install.command ?? null,
                  licenseDeclared: licensing.declared ?? null,
                  role: manifest.metadata.labels?.role ?? null,
                  manifest,
                }
              }),
            )
            .returning(implementationColumns),
        )
      },
      counts: counts.implementations,
    })
    for (const entry of implementations) {
      linkSource(
        "implementation",
        (implementationRowByDigest.get(entry.digest) as { id: string }).id,
        entry.externalId,
      )
    }

    // Content-addressed artifacts shared by implementations and runs.
    const artifactIdByDigest = new Map(
      [
        ...(await resolveByKey({
          entries: [
            ...implementations.flatMap((entry) => entry.artifacts ?? []),
            ...bundle.runs.flatMap((entry) => entry.artifacts ?? []),
          ],
          key: (artifact) => artifact.digest,
          fetch: (slice) =>
            tx
              .select({
                id: schema.artifacts.id,
                contentDigest: schema.artifacts.contentDigest,
              })
              .from(schema.artifacts)
              .where(
                inArray(schema.artifacts.contentDigest, slice as Digest[]),
              ),
          rowKey: (row) => row.contentDigest,
          insert: (missing) =>
            inChunks(missing, (slice) =>
              tx
                .insert(schema.artifacts)
                .values(
                  slice.map((artifact) => ({
                    contentDigest: artifact.digest,
                    kind: artifact.kind,
                    mediaType: artifact.mediaType,
                    sizeBytes: artifact.sizeBytes ?? null,
                    storage: artifact.storage,
                    uri: artifact.uri ?? null,
                    content: artifact.content ?? null,
                    license: artifact.license ?? null,
                  })),
                )
                .returning({
                  id: schema.artifacts.id,
                  contentDigest: schema.artifacts.contentDigest,
                }),
            ),
        })),
      ].map(([digest, row]) => [digest, row.id]),
    )

    // Append-only benchmark runs (§10.7). Revalidate and digest every run,
    // resolve referenced implementations and workloads that live in the
    // catalog but not in this bundle, then build and insert only the new
    // rows — protocol/environment digests are computed for those alone.
    const runs = bundle.runs.map((entry) => {
      const manifest = revalidated(entry.manifest)
      return {
        entry,
        manifest,
        protocol: revalidated(entry.protocol),
        environment: revalidated(entry.environment),
        digest: specDigest(manifest),
      }
    })
    const runIdByDigest = new Map(
      (
        await inChunks([...new Set(runs.map((run) => run.digest))], (slice) =>
          tx
            .select({
              id: schema.benchmarkRuns.id,
              runDigest: schema.benchmarkRuns.runDigest,
            })
            .from(schema.benchmarkRuns)
            .where(inArray(schema.benchmarkRuns.runDigest, slice)),
        )
      ).map((row) => [row.runDigest, row.id]),
    )
    const pendingRuns = uniqueBy(
      runs.filter((run) => !runIdByDigest.has(run.digest)),
      (run) => run.digest,
    )

    for (const row of await inChunks(
      [
        ...new Set(
          pendingRuns
            .map((run) => run.manifest.spec.implementationDigest)
            .filter((digest) => !implementationRowByDigest.has(digest)),
        ),
      ],
      fetchImplementations,
    )) {
      implementationRowByDigest.set(row.implementationDigest, row)
    }
    for (const row of await inChunks(
      [
        ...new Set(
          pendingRuns
            .map((run) => run.manifest.spec.workloadDigest)
            .filter((digest) => !workloadRowByDigest.has(digest)),
        ),
      ] as Digest[],
      (slice) =>
        tx
          .select({
            id: schema.workloads.id,
            workloadDigest: schema.workloads.workloadDigest,
            manifest: schema.workloads.manifest,
          })
          .from(schema.workloads)
          .where(inArray(schema.workloads.workloadDigest, slice)),
    )) {
      const manifest = row.manifest as AnyWorkloadManifest
      workloadRowByDigest.set(row.workloadDigest, {
        id: row.id,
        operationDigest: manifest.spec.operationSpecDigest,
        manifest,
      })
    }

    const insertedCohorts = new Set<string>()
    const runValues = pendingRuns.map((run) => {
      const { manifest, protocol, environment } = run
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
      const implementation = implementationRowByDigest.get(
        manifest.spec.implementationDigest,
      )
      if (!implementation) {
        throw new Error(
          `implementation ${manifest.spec.implementationDigest} is not in the bundle or catalog`,
        )
      }
      const workload = workloadRowByDigest.get(manifest.spec.workloadDigest)
      if (!workload) {
        throw new Error(
          `workload ${manifest.spec.workloadDigest} is not in the bundle or catalog`,
        )
      }
      const runCorrectnessKey = correctnessKey(
        workload.manifest.spec.correctness,
      )

      const timing = manifest.spec.timing
      const firstMeasurement = manifest.spec.measurements?.[0]
      const centralLatency = timing
        ? timing.primaryStatistic === "mean"
          ? (timing.latencyNs.mean ?? timing.latencyNs.median)
          : (timing.latencyNs.median ?? timing.latencyNs.mean)
        : undefined
      const primary =
        timing && centralLatency !== undefined
          ? {
              metric: "latency",
              statistic: timing.primaryStatistic,
              unit: "ns",
              value: centralLatency,
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

      const cohortKey = comparisonKey({
        operationDigest: workload.operationDigest,
        workloadDigest: manifest.spec.workloadDigest,
        protocolKey,
        environmentKey,
        correctnessKey: runCorrectnessKey,
        metricKey: primary
          ? metricKey(primary.metric, primary.statistic, primary.unit)
          : "none",
      })
      insertedCohorts.add(cohortKey)
      return {
        runDigest: run.digest,
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
        comparisonKey: cohortKey,
        primaryMetric: primary?.metric ?? "none",
        primaryValue: primary?.value ?? null,
        primaryUnit: primary?.unit ?? null,
        sampleCount: primary?.sampleCount ?? null,
        uncertaintyLow: timing?.latencyNs.confidence95?.[0] ?? null,
        uncertaintyHigh: timing?.latencyNs.confidence95?.[1] ?? null,
        reported: true,
        sourceAvailable: implementation.sourceAvailable,
        installable: implementation.installable,
        licenseExpression: implementation.licenseExpression,
        primaryStatistic: primary?.statistic ?? null,
        hasRawEvidence:
          timing?.rawSamples !== undefined ||
          manifest.spec.evidence?.rawSamples !== undefined ||
          manifest.spec.evidence?.logs !== undefined,
        sourceNative: manifest.spec.sourceNative !== undefined,
        solScore: manifest.spec.sourceNative?.metrics?.sol_score ?? null,
        environmentSummary:
          [
            environment.spec.software.cudaToolkit
              ? `CUDA ${environment.spec.software.cudaToolkit}`
              : null,
            environment.spec.software.framework
              ? `${environment.spec.software.framework.name} ${environment.spec.software.framework.version}`
              : null,
            protocol.spec.harness.name,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        manifest: { run: manifest, protocol, environment },
      }
    })
    for (const row of await inChunks(runValues, (slice) =>
      tx.insert(schema.benchmarkRuns).values(slice).returning({
        id: schema.benchmarkRuns.id,
        runDigest: schema.benchmarkRuns.runDigest,
      }),
    )) {
      runIdByDigest.set(row.runDigest, row.id)
    }
    counts.runs.inserted = runValues.length
    counts.runs.existing = runs.length - runValues.length
    const runIds = runs.map((run) => runIdByDigest.get(run.digest) as string)

    // Expand timing statistics and secondary measurements into typed rows,
    // for newly inserted runs only (existing runs already carry theirs).
    const measurementRows: (typeof schema.measurements.$inferInsert)[] = []
    const runArtifactRows: (typeof schema.runArtifacts.$inferInsert)[] = []
    for (const run of pendingRuns) {
      const runId = runIdByDigest.get(run.digest) as string
      linkSource("run", runId, run.entry.externalId)
      const timing = run.manifest.spec.timing
      if (timing) {
        const stats: [string, number | undefined][] = [
          ["median", timing.latencyNs.median],
          ["mean", timing.latencyNs.mean],
          ["p05", timing.latencyNs.p05],
          ["p95", timing.latencyNs.p95],
          ["min", timing.latencyNs.minimum],
          ["max", timing.latencyNs.maximum],
          ["mad", timing.latencyNs.mad],
        ]
        for (const [statistic, value] of stats) {
          if (value !== undefined) {
            measurementRows.push({
              runId,
              metric: "latency",
              statistic,
              unit: "ns",
              value,
              sampleCount: timing.samples ?? null,
            })
          }
        }
      }
      for (const extra of run.manifest.spec.measurements ?? []) {
        measurementRows.push({
          runId,
          metric: extra.metric,
          statistic: extra.statistic,
          unit: extra.unit,
          value: extra.value,
          sampleCount: extra.sampleCount ?? null,
        })
      }
      for (const artifact of run.entry.artifacts ?? []) {
        runArtifactRows.push({
          runId,
          artifactId: artifactIdByDigest.get(artifact.digest) as string,
          role: artifact.role,
        })
      }
    }
    await perChunk(measurementRows, (slice) =>
      tx.insert(schema.measurements).values(slice).onConflictDoNothing(),
    )
    await perChunk(runArtifactRows, (slice) =>
      tx.insert(schema.runArtifacts).values(slice).onConflictDoNothing(),
    )
    await perChunk(sourceLinkRows, (slice) =>
      tx.insert(schema.sourceLinks).values(slice).onConflictDoNothing(),
    )

    // Derived ranking may have changed (§11.10): append the record
    // transitions for every cohort this publication touched.
    if (options.publish && insertedCohorts.size > 0) {
      await syncRecordEvents(tx, [...insertedCohorts])
    }

    return { sourceId: source.id, counts, runIds }
  })
}

/** True when every listed run digest already exists (used by --dry-run). */
export async function existingRunDigests(
  database: DbHandle,
  digests: string[],
): Promise<Set<string>> {
  if (digests.length === 0) return new Set()
  const rows = await inChunks(digests, (slice) =>
    database
      .select({ runDigest: schema.benchmarkRuns.runDigest })
      .from(schema.benchmarkRuns)
      .where(inArray(schema.benchmarkRuns.runDigest, slice)),
  )
  return new Set(rows.map((row) => row.runDigest))
}
