// Implementation dossier read (§16.9): the revision's facts, its evidence
// rows ranked inside their cohorts, and the mirrored source with a line diff
// against the same author's previous imported submission.
import { and, desc, eq } from "drizzle-orm"
import type { ImplementationPageModel } from "../../lib/catalog-models.ts"
import { implementationDisplayName } from "../../lib/names.ts"
import type { ImplementationRevisionManifest } from "../../schemas/kinds.ts"
import { attestationCounts } from "../attestations.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { EXTRACTOR_VERSION } from "../enrich/techniques.ts"
import { cohortRanks } from "./cohorts.ts"
import { getRecordsPage } from "./home-reads.ts"
import { bestEvidence } from "./present.ts"
import { eligibleRunFilter } from "./record-events.ts"
import {
  implementationColumns,
  type JoinedRun,
  pageIllustrative,
  projectColumns,
  resultRow,
  runColumns,
  sourceColumns,
  sourceLanguage,
  sourcePolicy,
  sourceRefs,
} from "./run-rows.ts"
import { diffSource } from "./source-diff.ts"

const SUBMISSION_VERSION = /^submission-(\d+)$/

function submissionNumber(version: string | undefined): number | null {
  const match = version?.match(SUBMISSION_VERSION)
  return match ? Number(match[1]) : null
}

/** SPDX LicenseRef ids shown to humans as the license's actual name, so the
 * same license never appears under two spellings across pages. */
const LICENSE_DISPLAY: Record<string, string> = {
  "LicenseRef-GPUMode-Reciprocity-1.0":
    "June 9 Researcher Reciprocity License v1.0",
}

/**
 * Mirrored source for one implementation (§16.9): the inline artifact named
 * by the manifest's source digest, plus a line diff against the same
 * author's previous imported submission on this operation — the "what
 * changed to make it faster" evidence. Artifact bodies load only here.
 */
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
    language: sourceLanguage(artifact.mediaType, spec.fileName ?? null),
    content: artifact.content,
    license: artifact.license
      ? (LICENSE_DISPLAY[artifact.license] ?? artifact.license)
      : artifact.license,
    attribution,
    diff,
  }
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
  const [refs, sourceCode, ranks, ledger, techniques] = await Promise.all([
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
    database
      .select({
        trait: schema.implementationTraits.trait,
        value: schema.implementationTraits.value,
        evidence: schema.implementationTraits.evidence,
      })
      .from(schema.implementationTraits)
      .where(
        and(
          eq(schema.implementationTraits.implementationId, implementation.id),
          eq(schema.implementationTraits.extractorVersion, EXTRACTOR_VERSION),
        ),
      )
      .orderBy(schema.implementationTraits.trait),
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
    techniques,
    sourceCode,
  }
}
