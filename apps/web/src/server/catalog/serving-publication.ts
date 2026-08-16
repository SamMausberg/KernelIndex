// The idempotent serving publication transaction (§10.8 applied to the
// §10.1 serving tables). Same invariants as kernel publication: manifests
// revalidate inside the transaction, canonical rows resolve by content
// digest, runs append and never update. The §11.1 cohort key is computed
// here, inside the transaction, from the stored identities.
import { and, eq } from "drizzle-orm"
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
import type { DbHandle, EntityCounts, ImportBundle } from "./publication.ts"

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

    // Source registration; policy refreshes as mutable ingestion metadata.
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

    const projectIdBySlug = new Map<string, string>()
    for (const project of bundle.projects) {
      const manifest = revalidated(project.manifest)
      const [existing] = await tx
        .select({ id: schema.projects.id })
        .from(schema.projects)
        .where(eq(schema.projects.slug, project.slug))
      if (existing) {
        projectIdBySlug.set(project.slug, existing.id)
        counts.projects.existing++
        continue
      }
      const [row] = await tx
        .insert(schema.projects)
        .values({
          slug: project.slug,
          name: manifest.spec.name,
          normalizedName: manifest.spec.name.toLowerCase(),
          canonicalUrl: manifest.spec.repository ?? null,
          manifest,
        })
        .returning({ id: schema.projects.id })
      projectIdBySlug.set(project.slug, row.id)
      counts.projects.inserted++
    }

    /** Digest-keyed upsert shared by the four serving entity tables. */
    async function upsert<M extends { kind: string }>(
      entry: { manifest: M },
      digestColumn:
        | typeof schema.modelRevisions.modelDigest
        | typeof schema.servingStackRevisions.stackDigest
        | typeof schema.servingConfigurations.configurationDigest
        | typeof schema.servingWorkloads.workloadDigest,
      count: EntityCounts,
      insert: (manifest: M, digest: string) => Promise<string>,
    ): Promise<{ id: string; digest: string }> {
      const manifest = revalidated(entry.manifest)
      const digest = specDigest(
        manifest as unknown as Parameters<typeof specDigest>[0],
      )
      const [existing] = await tx
        .select({ id: sql_id(digestColumn) })
        .from(digestColumn.table)
        .where(eq(digestColumn, digest))
      if (existing) {
        count.existing++
        return { id: existing.id, digest }
      }
      const id = await insert(manifest, digest)
      count.inserted++
      return { id, digest }
    }
    const sql_id = (column: { table: unknown }) =>
      (column.table as { id: typeof schema.modelRevisions.id }).id

    const modelByDigest = new Map<string, string>()
    const modelManifestByDigest = new Map<string, ModelRevisionManifest>()
    for (const model of bundle.models) {
      const { id, digest } = await upsert(
        model,
        schema.modelRevisions.modelDigest,
        counts.models,
        async (manifest, digest) => {
          const [row] = await tx
            .insert(schema.modelRevisions)
            .values({
              slug: model.slug,
              modelDigest: digest,
              name: manifest.metadata.title ?? model.slug,
              tokenizer: manifest.spec.tokenizer?.name ?? null,
              parameterCount: manifest.spec.parameterCount ?? null,
              contextLength: manifest.spec.contextLength ?? null,
              license: manifest.spec.license ?? null,
              schemaVersion: API_VERSION,
              manifest,
            })
            .returning({ id: schema.modelRevisions.id })
          return row.id
        },
      )
      modelByDigest.set(digest, id)
      modelManifestByDigest.set(digest, model.manifest)
    }

    const stackByDigest = new Map<string, string>()
    for (const stack of bundle.stacks) {
      const projectId = projectIdBySlug.get(stack.projectSlug)
      if (!projectId)
        throw new Error(`stack '${stack.slug}' references unknown project`)
      const { id, digest } = await upsert(
        stack,
        schema.servingStackRevisions.stackDigest,
        counts.stacks,
        async (manifest, digest) => {
          const [row] = await tx
            .insert(schema.servingStackRevisions)
            .values({
              projectId,
              slug: stack.slug,
              stackDigest: digest,
              name: manifest.spec.revision.version ?? manifest.metadata.name,
              version: manifest.spec.revision.version ?? null,
              schemaVersion: API_VERSION,
              manifest,
            })
            .returning({ id: schema.servingStackRevisions.id })
          return row.id
        },
      )
      stackByDigest.set(digest, id)
    }

    const configurationByDigest = new Map<string, string>()
    for (const configuration of bundle.configurations) {
      const { id, digest } = await upsert(
        configuration,
        schema.servingConfigurations.configurationDigest,
        counts.configurations,
        async (manifest, digest) => {
          const stackId = stackByDigest.get(manifest.spec.stackDigest)
          if (!stackId)
            throw new Error("configuration references unknown stack digest")
          const [row] = await tx
            .insert(schema.servingConfigurations)
            .values({
              stackRevisionId: stackId,
              configurationDigest: digest,
              dtype: manifest.spec.dtype ?? null,
              quantization: manifest.spec.quantization ?? null,
              tensorParallel: manifest.spec.parallelism?.tensor ?? null,
              summary: configuration.summary,
              schemaVersion: API_VERSION,
              manifest,
            })
            .returning({ id: schema.servingConfigurations.id })
          return row.id
        },
      )
      configurationByDigest.set(digest, id)
    }

    const workloadByDigest = new Map<string, string>()
    const workloadManifestByDigest = new Map<string, ServingWorkloadManifest>()
    for (const workload of bundle.workloads) {
      const { id, digest } = await upsert(
        workload,
        schema.servingWorkloads.workloadDigest,
        counts.workloads,
        async (manifest, digest) => {
          const [row] = await tx
            .insert(schema.servingWorkloads)
            .values({
              workloadDigest: digest,
              slug: workload.slug,
              name: workload.name,
              streaming: manifest.spec.streaming,
              loadGeneration: manifest.spec.loadGeneration,
              schemaVersion: API_VERSION,
              manifest,
            })
            .returning({ id: schema.servingWorkloads.id })
          return row.id
        },
      )
      workloadByDigest.set(digest, id)
      workloadManifestByDigest.set(digest, workload.manifest)
    }

    const runIds: string[] = []
    for (const run of bundle.runs) {
      const manifest = revalidated(run.manifest)
      const digest = specDigest(manifest)
      const [existing] = await tx
        .select({ id: schema.servingRuns.id })
        .from(schema.servingRuns)
        .where(eq(schema.servingRuns.runDigest, digest))
      if (existing) {
        counts.runs.existing++
        runIds.push(existing.id)
        continue
      }
      const spec = manifest.spec
      const modelId = modelByDigest.get(spec.modelDigest)
      const configurationId = configurationByDigest.get(
        spec.configurationDigest,
      )
      const workloadId = workloadByDigest.get(spec.workloadDigest)
      const workloadManifest = workloadManifestByDigest.get(spec.workloadDigest)
      const modelManifest = modelManifestByDigest.get(spec.modelDigest)
      if (!modelId || !configurationId || !workloadId || !workloadManifest)
        throw new Error(
          `run '${manifest.metadata.name}' references digests outside the bundle`,
        )

      // §11.1 cohort identity, computed from stored identities in-transaction.
      const cohortKey = servingCohortKey({
        modelDigest: spec.modelDigest,
        tokenizer: modelManifest?.spec.tokenizer?.name ?? null,
        workloadDigest: spec.workloadDigest,
        protocolKey: servingProtocolKey({
          harnessName: spec.harness.name,
          harnessVersion: spec.harness.version,
          placement: spec.placement ?? null,
          streaming: workloadManifest.spec.streaming,
          loadGeneration: workloadManifest.spec.loadGeneration,
        }),
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

      const [row] = await tx
        .insert(schema.servingRuns)
        .values({
          runDigest: digest,
          modelRevisionId: modelId,
          configurationId,
          workloadId,
          sourceId: source.id,
          status: spec.status,
          observedAt: new Date(spec.observedAt),
          publishedAt: options.publish ? new Date() : null,
          cohortKey,
          protocolKey: servingProtocolKey({
            harnessName: spec.harness.name,
            harnessVersion: spec.harness.version,
            placement: spec.placement ?? null,
            streaming: workloadManifest.spec.streaming,
            loadGeneration: workloadManifest.spec.loadGeneration,
          }),
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
          manifest,
        })
        .returning({ id: schema.servingRuns.id })
      counts.runs.inserted++
      runIds.push(row.id)
      for (const measurement of spec.measurements) {
        await tx
          .insert(schema.servingMeasurements)
          .values({ runId: row.id, ...measurement })
          .onConflictDoNothing()
      }
      if (run.externalId !== undefined) {
        await tx
          .insert(schema.sourceLinks)
          .values({
            sourceId: source.id,
            entityKind: "serving_run",
            entityId: row.id,
            externalId: run.externalId,
          })
          .onConflictDoNothing()
      }
    }

    return { sourceId: source.id, counts, runIds }
  })
}
