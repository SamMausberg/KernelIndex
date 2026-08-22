// Submission validation and state machine (§15.2–15.4): the document is
// validated with the strict canonical schemas; guarded transitions never
// skip review; a structurally valid bundle round-trips the registry
// examples that the importers themselves publish.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parse as parseYaml, stringify } from "yaml"
import { submissionFromBenchRecord } from "./bench-record.ts"
import {
  bundleFromSubmission,
  previewSubmission,
  SUBMISSION_TRANSITIONS,
} from "./submissions.ts"

const examples = path.resolve(
  import.meta.dirname,
  "../../../../../registry/examples",
)
const example = (file: string): unknown =>
  parseYaml(readFileSync(path.join(examples, file), "utf8"))

describe("submissions", () => {
  it("validates a complete document built from the registry examples", () => {
    const document = stringify({
      projects: [example("software-project.yaml")],
      operations: [example("operation-spec.yaml")],
      workloads: [example("workload-case.yaml")],
      implementations: [
        {
          projectSlug: "meridian-kernels",
          manifest: example("implementation-revision.yaml"),
        },
      ],
    })
    const { bundle, report } = bundleFromSubmission(document)
    expect(report.issues).toEqual([])
    expect(report.valid).toBe(true)
    expect(bundle.projects).toHaveLength(1)
    expect(bundle.operations).toHaveLength(1)
    expect(bundle.workloads).toHaveLength(1)
    expect(bundle.implementations).toHaveLength(1)
    expect(report.objects.every((o) => o.digest.startsWith("sha256:"))).toBe(
      true,
    )
  })

  it("rejects invalid manifests with located issues", () => {
    const { report } = bundleFromSubmission(
      "operations:\n  - apiVersion: kernelindex.dev/v1alpha1\n    kind: OperationSpec\n    metadata: { name: broken }\n    spec: {}",
    )
    expect(report.valid).toBe(false)
    expect(report.issues[0]).toContain("operations[0]")
  })

  it("requires projectSlug on implementations", () => {
    const document = stringify({
      implementations: [{ manifest: example("implementation-revision.yaml") }],
    })
    const { report } = bundleFromSubmission(document)
    expect(report.valid).toBe(false)
    expect(report.issues.join(" ")).toContain("projectSlug")
  })

  it("assembles a flat bench record into a digest-chained bundle", () => {
    const record = JSON.parse(
      readFileSync(path.join(examples, "bench-record.json"), "utf8"),
    )
    const { report, bundle } = bundleFromSubmission(JSON.stringify(record))
    expect(report.issues).toEqual([])
    expect(report.valid).toBe(true)
    expect(bundle.projects).toHaveLength(1)
    expect(bundle.workloads).toHaveLength(1)
    expect(bundle.implementations).toHaveLength(1)
    expect(bundle.runs).toHaveLength(1)
    // The run's digests chain to the assembled manifests, so the same
    // publication transaction accepts it (§15.2).
    const kinds = report.objects.map((object) => object.kind).sort()
    expect(kinds).toEqual([
      "BenchmarkProtocol",
      "BenchmarkRun",
      "ExecutionEnvironment",
      "ImplementationRevision",
      "SoftwareProject",
      "WorkloadCase",
    ])
    const digest = (kind: string) =>
      report.objects.find((object) => object.kind === kind)?.digest
    expect(bundle.runs[0].manifest.spec.workloadDigest).toBe(
      digest("WorkloadCase"),
    )
    expect(bundle.runs[0].manifest.spec.implementationDigest).toBe(
      digest("ImplementationRevision"),
    )
  })

  it("names what a bench record is missing", () => {
    const { issues } = submissionFromBenchRecord({
      workload: {},
      implementation: {},
      run: {},
    })
    expect(issues.join(" ")).toContain("project.name")
    expect(issues.join(" ")).toContain("operation.specDigest")
    expect(issues.join(" ")).toContain("run.observedAt")
  })

  it("guards the state machine (§15.4)", () => {
    expect(SUBMISSION_TRANSITIONS.draft).toContain("validating")
    expect(SUBMISSION_TRANSITIONS.in_review).toContain("accepted")
    expect(SUBMISSION_TRANSITIONS.rejected).toEqual([])
    expect(SUBMISSION_TRANSITIONS.published).toEqual([])
    // No transition ever jumps from draft straight to published.
    expect(SUBMISSION_TRANSITIONS.draft).not.toContain("published")
    expect(SUBMISSION_TRANSITIONS.ready_for_review).not.toContain("accepted")
  })
})

describe.skipIf(!process.env.DATABASE_URL)(
  "placement preview (database)",
  () => {
    it("states the cohort and rank each run would take", async () => {
      const record = readFileSync(
        path.join(examples, "bench-record.json"),
        "utf8",
      )
      const { report, placement } = await previewSubmission(record)
      expect(report.valid).toBe(true)
      expect(placement).toHaveLength(1)
      const [entry] = placement
      expect(entry.cohort).not.toBeNull()
      expect(entry.note).toMatch(/first entry|would rank|reviewer maps/)
    })
  },
)
