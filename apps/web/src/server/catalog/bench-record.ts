// The bench record (§15.5): one flat JSON document instead of six digest-
// chained manifests. The converter assembles the canonical manifests,
// computes every digest, and hands over the same submission document the
// YAML path uses — the strict per-kind schemas then validate the assembly,
// so a record can never bypass the manifest contract.
import type { AnyManifest } from "../../schemas/kinds.ts"
import { specDigest } from "../identity/digest.ts"
import { kebab } from "../import/shared.ts"

/** Digest of a not-yet-validated assembly; the strict schemas run next. */
const digestOf = (manifest: unknown) =>
  specDigest(manifest as unknown as AnyManifest)

type Loose = Record<string, unknown>
const at = (value: unknown, path: string[]): unknown =>
  path.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === "object"
        ? (node as Loose)[key]
        : undefined,
    value,
  )
const text = (value: unknown, path: string[]): string | null => {
  const found = at(value, path)
  return typeof found === "string" && found !== "" ? found : null
}

/** A flat record: exactly one run with its context, no manifest envelopes.
 * Multi-document submissions keep the `runs:`/`projects:` shape instead. */
export function isBenchRecord(document: unknown): document is Loose {
  return (
    document !== null &&
    typeof document === "object" &&
    "run" in document &&
    "workload" in document &&
    "implementation" in document &&
    !("runs" in document)
  )
}

const envelope = (kind: string, name: string, spec: unknown) => ({
  apiVersion: "kernelindex.dev/v1alpha1",
  kind,
  metadata: { name },
  spec,
})

/** GitHub `owner/repo` host identity from a repository URL, so a recorded
 * project is one-click claimable (§15.3). */
function hostOf(repository: string | null) {
  const match = repository?.match(
    /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/,
  )
  return match ? { kind: "github" as const, id: match[1] } : undefined
}

/**
 * Assemble the submission document a bench record describes. Structural
 * problems come back as named issues; everything deeper is caught by the
 * strict manifest validation that follows.
 */
export function submissionFromBenchRecord(record: Loose): {
  document: Loose
  issues: string[]
} {
  const issues: string[] = []
  const need = (path: string[], what = "is required") => {
    if (at(record, path) === undefined) issues.push(`${path.join(".")} ${what}`)
  }
  need(["project", "name"])
  need(
    ["operation", "specDigest"],
    "is required (copy it from the operation page's identity)",
  )
  need(["workload", "axes"])
  need(["workload", "tensors"])
  need(["workload", "correctness"])
  need(["implementation", "name"])
  need(["implementation", "language"])
  need(["protocol", "harness", "name"])
  need(["protocol", "measurement", "timer"])
  need(["protocol", "measurement", "primaryStatistic"])
  need(["environment", "hardware", "vendor"])
  need(["environment", "hardware", "product"])
  need(["environment", "hardware", "architecture"])
  need(
    ["run", "timing", "latencyNs"],
    "is required (median or mean, in nanoseconds)",
  )
  need(["run", "observedAt"])
  if (issues.length > 0) return { document: {}, issues }

  const projectName = text(record, ["project", "name"]) as string
  const repository =
    text(record, ["project", "repository"]) ??
    text(record, ["implementation", "repository"])
  const operationSpecDigest = text(record, ["operation", "specDigest"])
  const project = envelope("SoftwareProject", kebab(projectName), {
    name: projectName,
    ...(repository ? { repository, host: hostOf(repository) } : {}),
  })

  const { name: workloadName, ...workloadSpec } = record.workload as Loose
  const axes = (workloadSpec.axes ?? {}) as Record<string, number>
  const workload = envelope(
    "WorkloadCase",
    typeof workloadName === "string"
      ? kebab(workloadName)
      : kebab(
          `case ${Object.entries(axes)
            .map(([axis, value]) => `${axis} ${value}`)
            .join(" ")}`,
        ),
    { operationSpecDigest, ...workloadSpec },
  )

  const { name: protocolName, ...protocolSpec } = record.protocol as Loose
  const protocol = envelope(
    "BenchmarkProtocol",
    typeof protocolName === "string"
      ? kebab(protocolName)
      : kebab(`${text(record, ["protocol", "harness", "name"])} protocol`),
    protocolSpec,
  )

  const { name: environmentName, ...environmentSpec } =
    record.environment as Loose
  const environment = envelope(
    "ExecutionEnvironment",
    typeof environmentName === "string"
      ? kebab(environmentName)
      : kebab(`${text(record, ["environment", "hardware", "product"])} env`),
    environmentSpec,
  )

  const impl = record.implementation as Loose
  const commit = text(impl, ["commit"])
  const tensorDtypes = [
    ...new Set(
      Object.values((workloadSpec.tensors ?? {}) as Loose).flatMap((tensor) =>
        typeof (tensor as Loose).dtype === "string"
          ? [(tensor as Loose).dtype as string]
          : [],
      ),
    ),
  ]
  const implementation = envelope(
    "ImplementationRevision",
    kebab(String(impl.name)),
    {
      projectRevision: {
        ...(repository ? { repository } : {}),
        ...(commit ? { commit } : {}),
      },
      operation: { specDigest: operationSpecDigest },
      callable: {
        language: impl.language,
        ...(text(impl, ["path"]) ? { path: impl.path } : {}),
        ...(text(impl, ["symbol"]) ? { symbol: impl.symbol } : {}),
        ...(text(impl, ["interface"]) ? { interface: impl.interface } : {}),
      },
      support: {
        hardwareArchitectures: Array.isArray(impl.architectures)
          ? impl.architectures
          : [text(record, ["environment", "hardware", "architecture"])],
        productsTested: [text(record, ["environment", "hardware", "product"])],
        dtypes: Array.isArray(impl.dtypes) ? impl.dtypes : tensorDtypes,
      },
      ...(repository && commit
        ? {
            buildVariants: [
              { name: "source", install: { kind: "git", repository, commit } },
            ],
          }
        : {}),
      licensing: text(impl, ["license"]) ? { declared: impl.license } : {},
    },
  )

  const runSpec = record.run as Loose
  const run = envelope(
    "BenchmarkRun",
    kebab(`${String(impl.name)} ${String(workload.metadata.name)}`),
    {
      implementationDigest: digestOf(implementation),
      workloadDigest: digestOf(workload),
      protocolDigest: digestOf(protocol),
      environmentDigest: digestOf(environment),
      status: runSpec.status ?? "passed",
      ...(runSpec.correctness !== undefined
        ? { correctness: runSpec.correctness }
        : {}),
      timing: runSpec.timing,
      observedAt: runSpec.observedAt,
    },
  )

  return {
    document: {
      projects: [project],
      workloads: [workload],
      implementations: [
        { projectSlug: kebab(projectName), manifest: implementation },
      ],
      runs: [{ run, protocol, environment }],
    },
    issues: [],
  }
}
