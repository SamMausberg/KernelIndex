// Submission validation and state machine (§15.2–15.4): the document is
// validated with the strict canonical schemas; guarded transitions never
// skip review; a structurally valid bundle round-trips the registry
// examples that the importers themselves publish.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { parse as parseYaml, stringify } from "yaml"
import { bundleFromSubmission, SUBMISSION_TRANSITIONS } from "./submissions.ts"

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
