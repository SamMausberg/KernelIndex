// The idempotent serving publication transaction (§10.8 applied to the
// §10.1 serving tables). Same invariants as kernel publication: manifests
// revalidate inside the transaction, canonical rows resolve by content
// digest, runs append and never update. The §11.1 cohort key is computed
// here, inside the transaction, from the stored identities. Writes are
// set-based via the helpers shared with publication.ts.
import { inArray } from "drizzle-orm"
import type {
  ModelRevisionManifest,
  ServingConfigurationManifest,
  ServingRunManifest,
  ServingStackRevisionManifest,
  ServingWorkloadManifest,
  SoftwareProjectManifest,
} from "../../schemas/kinds.ts"
import { API_VERSION } from "../../schemas/kinds.ts"
import { parseManifestDocument } from "../../schemas/parse.ts"
import * as schema from "../db/schema.ts"
import { specDigest } from "../identity/digest.ts"
import {
  metricSetKey,
  servingCohortKey,
  servingProtocolKey,
  servingTopologyKey,
} from "../policy/serving.ts"
import {
  type DbHandle,
  type EntityCounts,
  type ImportBundle,
  inChunks,
  perChunk,
  publishSourceAndSnapshots,
  resolveByKey,
  resolveProjects,
  uniqueBy,
} from "./publication.ts"

export type ServingImportBundle = {
  source: ImportBundle["source"]
  snapshots?: ImportBundle["snapshots"]
  projects: { manifest: SoftwareProjectManifest; slug: string }[]
  models: { manifest: ModelRevisionManifest; slug: string }[]
  stacks: {
    manifest: ServingStackRevisionManifest
    slug: string
    projectSlug: string
  }[]
  configurations: { manifest: ServingConfigurationManifest; summary: string }[]
  workloads: { manifest: ServingWorkloadManifest; slug: string; name: string }[]
  runs: { manifest: ServingRunManifest; externalId?: string }[]
}

export type ServingPublicationResult = {
  sourceId: string
  counts: Record<
    | "snapshots"
    | "projects"
    | "models"
    | "stacks"
    | "configurations"
    | "workloads"
    | "runs",
    EntityCounts
  >
  runIds: string[]
}

function revalidated<M extends { kind: string }>(manifest: M): M {
  const parsed = parseManifestDocument(manifest)
  if (parsed.kind !== manifest.kind)
    throw new Error("manifest kind changed during revalidation")
  return parsed as unknown as M
}

/** Revalidate and digest one serving entry; shared entry shape for maps. */
function keyed<E extends { manifest: { kind: string } }>(entry: E) {
  const manifest = revalidated(entry.manifest)
  return {
    ...entry,
    manifest,
    digest: specDigest(manifest as Parameters<typeof specDigest>[0]),
  }
}

export async function publishServingBundle(
  database: DbHandle,
  bundle: ServingImportBundle,
  options: { publish: boolean },
): Promise<ServingPublicationResult> {
  return database.transaction(async (tx) => {
    const counts: ServingPublicationResult["counts"] = {
      snapshots: { inserted: 0, existing: 0 },
      projects: { inserted: 0, existing: 0 },
      models: { inserted: 0, existing: 0 },
      stacks: { inserted: 0, existing: 0 },
      configurations: { inserted: 0, existing: 0 },
      workloads: { inserted: 0, existing: 0 },
      runs: { inserted: 0, existing: 0 },
    }

    const source = await publishSourceAndSnapshots(tx, bundle, counts.snapshots)
    const projectIdBySlug = await resolveProjects(
      tx,
      bundle.projects,
      counts.projects,
    )

    const models = bundle.models.map(keyed)
    const modelIdByDigest = await resolveByKey({
      entries: models,
      key: (entry) => entry.digest,
      fetch: (slice) =>
        tx
          .select({
            id: schema.modelRevisions.id,
            digest: schema.modelRevisions.modelDigest,
          })
          .from(schema.modelRevisions)
          .where(inArray(schema.modelRevisions.modelDigest, slice)),
      rowKey: (row) => row.digest,
      insert: (missing) =>
        inChunks(missing, (slice) =>
          tx
            .insert(schema.modelRevisions)
            .values(
              slice.map(({ slug, manifest, digest }) => ({
                slug,
                modelDigest: digest,
                name: manifest.metadata.title ?? slug,
                tokenizer: manifest.spec.tokenizer?.name ?? null,
                parameterCount: manifest.spec.parameterCount ?? null,
                contextLength: manifest.spec.contextLength ?? null,
                license: manifest.spec.license ?? null,
                schemaVersion: API_VERSION,
                manifest,
              })),
            )
            .returning({
              id: schema.modelRevisions.id,
              digest: schema.modelRevisions.modelDigest,
            }),
        ),
      counts: counts.models,
    })
    const modelManifestByDigest = new Map<string, ModelRevisionManifest>(
      models.map((entry) => [entry.digest, entry.manifest]),
    )

    const stacks = bundle.stacks.map(keyed)
    for (const stack of stacks) {
      if (!projectIdBySlug.has(stack.projectSlug))
        throw new Error(`stack '${stack.slug}' references unknown project`)
    }
    const stackIdByDigest = await resolveByKey({
      entries: stacks,
      key: (entry) => entry.digest,
      fetch: (slice) =>
        tx
          .select({
            id: schema.servingStackRevisions.id,
            digest: schema.servingStackRevisions.stackDigest,
          })
          .from(schema.servingStackRevisions)
          .where(inArray(schema.servingStackRevisions.stackDigest, slice)),
      rowKey: (row) => row.digest,
      insert: (missing) =>
        inChunks(missing, (slice) =>
          tx
            .insert(schema.servingStackRevisions)
            .values(
              slice.map(({ slug, projectSlug, manifest, digest }) => ({
                projectId: (projectIdBySlug.get(projectSlug) as { id: string })
                  .id,
                slug,
                stackDigest: digest,
                name: manifest.spec.revision.version ?? manifest.metadata.name,
                version: manifest.spec.revision.version ?? null,
                schemaVersion: API_VERSION,
                manifest,
              })),
            )
            .returning({
              id: schema.servingStackRevisions.id,
              digest: schema.servingStackRevisions.stackDigest,
            }),
        ),
      counts: counts.stacks,
    })

    const configurations = bundle.configurations.map(keyed)
    const configurationIdByDigest = await resolveByKey({
      entries: configurations,
      key: (entry) => entry.digest,
      fetch: (slice) =>
        tx
          .select({
            id: schema.servingConfigurations.id,
            digest: schema.servingConfigurations.configurationDigest,
          })
          .from(schema.servingConfigurations)
          .where(
            inArray(schema.servingConfigurations.configurationDigest, slice),
          ),
      rowKey: (row) => row.digest,
      insert: (missing) =>
        inChunks(missing, (slice) =>
          tx
            .insert(schema.servingConfigurations)
            .values(
              slice.map(({ summary, manifest, digest }) => {
                const stack = stackIdByDigest.get(manifest.spec.stackDigest)
                if (!stack)
                  throw new Error(
                    "configuration references unknown stack digest",
                  )
                return {
                  stackRevisionId: stack.id,
                  configurationDigest: digest,
                  dtype: manifest.spec.dtype ?? null,
                  quantization: manifest.spec.quantization ?? null,
                  tensorParallel: manifest.spec.parallelism?.tensor ?? null,
                  summary,
                  schemaVersion: API_VERSION,
                  manifest,
                }
              }),
            )
            .returning({
              id: schema.servingConfigurations.id,
              digest: schema.servingConfigurations.configurationDigest,
            }),
        ),
      counts: counts.configurations,
    })

    const workloads = bundle.workloads.map(keyed)
    const workloadIdByDigest = await resolveByKey({
      entries: workloads,
      key: (entry) => entry.digest,
      fetch: (slice) =>
        tx
          .select({
            id: schema.servingWorkloads.id,
            digest: schema.servingWorkloads.workloadDigest,
          })
          .from(schema.servingWorkloads)
          .where(inArray(schema.servingWorkloads.workloadDigest, slice)),
      rowKey: (row) => row.digest,
      insert: (missing) =>
        inChunks(missing, (slice) =>
          tx
            .insert(schema.servingWorkloads)
            .values(
              slice.map(({ slug, name, manifest, digest }) => ({
                workloadDigest: digest,
                slug,
                name,
                streaming: manifest.spec.streaming,
                loadGeneration: manifest.spec.loadGeneration,
                schemaVersion: API_VERSION,
                manifest,
              })),
            )
            .returning({
              id: schema.servingWorkloads.id,
              digest: schema.servingWorkloads.workloadDigest,
            }),
        ),
      counts: counts.workloads,
    })
    const workloadManifestByDigest = new Map<string, ServingWorkloadManifest>(
      workloads.map((entry) => [entry.digest, entry.manifest]),
    )

    // Append-only serving runs.
    const runs = bundle.runs.map(keyed)
    const runIdByDigest = new Map<string, string>(
      (
        await inChunks([...new Set(runs.map((run) => run.digest))], (slice) =>
          tx
            .select({
              id: schema.servingRuns.id,
              runDigest: schema.servingRuns.runDigest,
            })
            .from(schema.servingRuns)
            .where(inArray(schema.servingRuns.runDigest, slice)),
        )
      ).map((row) => [row.runDigest, row.id]),
    )
    const pendingRuns = uniqueBy(
      runs.filter((run) => !runIdByDigest.has(run.digest)),
      (run) => run.digest,
    )
    const runValues = pendingRuns.map((run) => {
      const spec = run.manifest.spec
      const model = modelIdByDigest.get(spec.modelDigest)
      const configuration = configurationIdByDigest.get(
        spec.configurationDigest,
      )
      const workload = workloadIdByDigest.get(spec.workloadDigest)
      const workloadManifest = workloadManifestByDigest.get(spec.workloadDigest)
      const modelManifest = modelManifestByDigest.get(spec.modelDigest)
      if (!model || !configuration || !workload || !workloadManifest)
        throw new Error(
          `run '${run.manifest.metadata.name}' references digests outside the bundle`,
        )

      const protocolKey = servingProtocolKey({
        harnessName: spec.harness.name,
        harnessVersion: spec.harness.version,
        placement: spec.placement ?? null,
        streaming: workloadManifest.spec.streaming,
        loadGeneration: workloadManifest.spec.loadGeneration,
      })
      // §11.1 cohort identity, computed from stored identities in-transaction.
      const cohortKey = servingCohortKey({
        modelDigest: spec.modelDigest,
        tokenizer: modelManifest?.spec.tokenizer?.name ?? null,
        workloadDigest: spec.workloadDigest,
        protocolKey,
        topologyKey: servingTopologyKey({
          acceleratorVendor: spec.topology.acceleratorVendor ?? null,
          acceleratorModel: spec.topology.acceleratorModel,
          acceleratorsPerNode: spec.topology.acceleratorsPerNode,
          nodeCount: spec.topology.nodeCount,
          interconnect: spec.topology.interconnect ?? null,
        }),
        qualityPolicy: spec.qualityPolicy,
        metricSetKey: metricSetKey(spec.measurements),
      })

      return {
        runDigest: run.digest,
        modelRevisionId: model.id,
        configurationId: configuration.id,
        workloadId: workload.id,
        sourceId: source.id,
        status: spec.status,
        observedAt: new Date(spec.observedAt),
        publishedAt: options.publish ? new Date() : null,
        cohortKey,
        protocolKey,
        qualityPolicy: spec.qualityPolicy,
        metricSetKey: metricSetKey(spec.measurements),
        scenario: spec.sourceNative?.scenario ?? "unspecified",
        acceleratorVendor: spec.topology.acceleratorVendor ?? null,
        acceleratorModel: spec.topology.acceleratorModel,
        acceleratorCount: spec.topology.acceleratorsPerNode,
        nodeCount: spec.topology.nodeCount,
        totalAccelerators:
          spec.topology.acceleratorsPerNode * spec.topology.nodeCount,
        reported: true,
        schemaVersion: API_VERSION,
        manifest: run.manifest,
      }
    })
    for (const row of await inChunks(runValues, (slice) =>
      tx.insert(schema.servingRuns).values(slice).returning({
        id: schema.servingRuns.id,
        runDigest: schema.servingRuns.runDigest,
      }),
    )) {
      runIdByDigest.set(row.runDigest, row.id)
    }
    counts.runs.inserted = runValues.length
    counts.runs.existing = runs.length - runValues.length
    const runIds = runs.map((run) => runIdByDigest.get(run.digest) as string)

    const measurementRows: (typeof schema.servingMeasurements.$inferInsert)[] =
      []
    const sourceLinkRows: (typeof schema.sourceLinks.$inferInsert)[] = []
    for (const run of pendingRuns) {
      const runId = runIdByDigest.get(run.digest) as string
      for (const measurement of run.manifest.spec.measurements) {
        measurementRows.push({ runId, ...measurement })
      }
      if (run.externalId !== undefined) {
        sourceLinkRows.push({
          sourceId: source.id,
          entityKind: "serving_run",
          entityId: runId,
          externalId: run.externalId,
        })
      }
    }
    await perChunk(measurementRows, (slice) =>
      tx.insert(schema.servingMeasurements).values(slice).onConflictDoNothing(),
    )
    await perChunk(sourceLinkRows, (slice) =>
      tx.insert(schema.sourceLinks).values(slice).onConflictDoNothing(),
    )

    return { sourceId: source.id, counts, runIds }
  })
}
