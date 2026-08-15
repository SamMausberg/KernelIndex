// Contribution submissions (§15.2–15.5): one submission model behind both
// the web flow and the PR path. A submission document is validated with the
// same strict Zod manifests and published — on acceptance only — through
// the same publication transaction as every importer. Neither path can
// touch derived rankings directly.
import { eq } from "drizzle-orm"
import { parse as parseYaml } from "yaml"
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
import { parseManifestDocument } from "../../schemas/parse.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"
import { specDigest } from "../identity/digest.ts"
import { kebab } from "../import/shared.ts"
import type { SessionUser } from "../policy/authorization.ts"
import { type ImportBundle, publishBundle } from "./publication.ts"

/** Community submissions publish under one reviewed source (§15.1). */
export const COMMUNITY_SOURCE = {
  slug: "community",
  kind: "submission",
  name: "Community submissions",
} as const

/** §15.4 state machine; every transition is guarded and audited. */
export const SUBMISSION_TRANSITIONS: Record<string, string[]> = {
  draft: ["validating", "withdrawn"],
  validating: ["needs_changes", "ready_for_review"],
  needs_changes: ["validating", "withdrawn"],
  ready_for_review: ["in_review", "withdrawn"],
  in_review: ["accepted", "rejected", "needs_changes"],
  accepted: ["published"],
  rejected: [],
  withdrawn: [],
  published: [],
}

export type SubmissionReport = {
  valid: boolean
  issues: string[]
  objects: { kind: string; name: string; digest: string }[]
}

type SubmissionDocument = {
  projects?: unknown[]
  operations?: unknown[]
  workloads?: unknown[]
  implementations?: { manifest?: unknown; projectSlug?: unknown }[]
  runs?: { run?: unknown; protocol?: unknown; environment?: unknown }[]
}

/**
 * Validate a submission document (YAML) and assemble the ImportBundle it
 * would publish. Every manifest passes the strict Zod schemas including
 * canonical refinements; digests are computed for the §15.5 preview.
 */
export function bundleFromSubmission(text: string): {
  bundle: ImportBundle
  report: SubmissionReport
} {
  const report: SubmissionReport = { valid: true, issues: [], objects: [] }
  const bundle: ImportBundle = {
    source: { ...COMMUNITY_SOURCE },
    projects: [],
    operations: [],
    workloads: [],
    implementations: [],
    runs: [],
  }
  let document: SubmissionDocument
  try {
    const parsed = parseYaml(text) as unknown
    if (parsed === null || typeof parsed !== "object")
      throw new Error("not a submission document")
    document = parsed as SubmissionDocument
  } catch (error) {
    return {
      bundle,
      report: {
        valid: false,
        issues: [`document: ${(error as Error).message}`],
        objects: [],
      },
    }
  }

  const manifest = <M extends AnyManifest>(
    value: unknown,
    where: string,
    kinds: string[],
  ): M | null => {
    try {
      const parsed = parseManifestDocument(value)
      if (!kinds.includes(parsed.kind)) {
        report.issues.push(`${where}: unexpected kind '${parsed.kind}'`)
        report.valid = false
        return null
      }
      report.objects.push({
        kind: parsed.kind,
        name: parsed.metadata.name,
        digest: specDigest(parsed),
      })
      return parsed as M
    } catch (error) {
      report.valid = false
      report.issues.push(`${where}: ${(error as Error).message}`)
      return null
    }
  }

  for (const [index, entry] of (document.projects ?? []).entries()) {
    const parsed = manifest<SoftwareProjectManifest>(
      entry,
      `projects[${index}]`,
      ["SoftwareProject"],
    )
    if (parsed)
      bundle.projects.push({
        manifest: parsed,
        slug: kebab(parsed.metadata.name),
      })
  }
  for (const [index, entry] of (document.operations ?? []).entries()) {
    const parsed = manifest<OperationSpecManifest>(
      entry,
      `operations[${index}]`,
      ["OperationSpec"],
    )
    if (parsed)
      bundle.operations.push({
        manifest: parsed,
        slug: kebab(parsed.metadata.name),
      })
  }
  for (const [index, entry] of (document.workloads ?? []).entries()) {
    const parsed = manifest<WorkloadCaseManifest | WorkloadSuiteManifest>(
      entry,
      `workloads[${index}]`,
      ["WorkloadCase", "WorkloadSuite"],
    )
    if (parsed) bundle.workloads.push({ manifest: parsed })
  }
  for (const [index, entry] of (document.implementations ?? []).entries()) {
    const parsed = manifest<ImplementationRevisionManifest>(
      entry.manifest,
      `implementations[${index}].manifest`,
      ["ImplementationRevision"],
    )
    if (!parsed) continue
    if (typeof entry.projectSlug !== "string" || entry.projectSlug === "") {
      report.valid = false
      report.issues.push(`implementations[${index}]: projectSlug is required`)
      continue
    }
    bundle.implementations.push({
      manifest: parsed,
      slug: kebab(parsed.metadata.name),
      projectSlug: entry.projectSlug,
    })
  }
  for (const [index, entry] of (document.runs ?? []).entries()) {
    const run = manifest<BenchmarkRunManifest>(
      entry.run,
      `runs[${index}].run`,
      ["BenchmarkRun"],
    )
    const protocol = manifest<BenchmarkProtocolManifest>(
      entry.protocol,
      `runs[${index}].protocol`,
      ["BenchmarkProtocol"],
    )
    const environment = manifest<ExecutionEnvironmentManifest>(
      entry.environment,
      `runs[${index}].environment`,
      ["ExecutionEnvironment"],
    )
    if (run && protocol && environment)
      bundle.runs.push({ manifest: run, protocol, environment })
  }

  if (report.objects.length === 0) {
    report.valid = false
    report.issues.push("document contains no manifests")
  }
  return { bundle, report }
}

async function audit(
  actor: SessionUser | { id: string; name: string },
  action: string,
  targetId: string,
  reason: string | null,
) {
  await db()
    .insert(schema.auditEvents)
    .values({
      actor: `${actor.name} (${actor.id})`,
      action,
      targetKind: "submission",
      targetId,
      reason,
    })
}

/** Web flow: validate immediately; a clean document goes straight to
 * ready_for_review, a broken one to needs_changes with the report. */
export async function createSubmission(
  user: SessionUser,
  text: string,
): Promise<{ id: string; report: SubmissionReport; state: string }> {
  const { bundle, report } = bundleFromSubmission(text)
  const state = report.valid ? "ready_for_review" : "needs_changes"
  const [row] = await db()
    .insert(schema.submissions)
    .values({
      userId: user.id,
      state,
      bundle: bundle as unknown,
      validationReport: report,
    })
    .returning({ id: schema.submissions.id })
  await audit(user, "create_submission", row.id, null)
  return { id: row.id, report, state }
}

/** Review decision (§15.4): acceptance publishes through the one
 * publication transaction; nothing else may write the catalog. */
export async function reviewSubmission(
  reviewer: SessionUser,
  input: { id: string; decision: "accepted" | "rejected"; note: string },
): Promise<{ state: string }> {
  const [submission] = await db()
    .select()
    .from(schema.submissions)
    .where(eq(schema.submissions.id, input.id))
  if (!submission) throw new Error("submission not found")
  const from =
    submission.state === "ready_for_review" ? "in_review" : submission.state
  if (!SUBMISSION_TRANSITIONS[from]?.includes(input.decision))
    throw new Error(`cannot ${input.decision} from state ${submission.state}`)

  if (input.decision === "accepted") {
    await publishBundle(db(), submission.bundle as ImportBundle, {
      publish: true,
    })
  }
  const state = input.decision === "accepted" ? "published" : "rejected"
  await db()
    .update(schema.submissions)
    .set({ state, reviewNote: input.note, updatedAt: new Date() })
    .where(eq(schema.submissions.id, input.id))
  await audit(reviewer, `submission_${input.decision}`, input.id, input.note)
  return { state }
}
