// registry/examples must always parse, and its digest chain must stay
// consistent: referenced digests equal the actual spec digests of the
// referenced example manifests (§9.8: schemas ship with valid and invalid
// examples).
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { specDigest } from "../server/identity/digest.ts"
import { parseManifestText } from "./parse.ts"

const examplesDir = path.resolve(
  import.meta.dirname,
  "../../../../registry/examples",
)
const read = (file: string) =>
  readFileSync(path.join(examplesDir, file), "utf8")
const manifest = (file: string) => parseManifestText(read(file))

describe("registry examples", () => {
  it("every valid example parses", () => {
    const files = readdirSync(examplesDir).filter((f) => f.endsWith(".yaml"))
    expect(files.length).toBeGreaterThanOrEqual(8)
    for (const file of files) expect(() => manifest(file), file).not.toThrow()
  })

  it("every invalid example is rejected", () => {
    const invalidDir = path.join(examplesDir, "invalid")
    const files = readdirSync(invalidDir).filter((f) => f.endsWith(".yaml"))
    expect(files.length).toBeGreaterThanOrEqual(4)
    for (const file of files) {
      expect(
        () =>
          parseManifestText(readFileSync(path.join(invalidDir, file), "utf8")),
        file,
      ).toThrow()
    }
  })

  it("the digest chain is consistent", () => {
    const operation = manifest("operation-spec.yaml")
    const workload = manifest("workload-case.yaml")
    const implementation = manifest("implementation-revision.yaml")
    const protocol = manifest("benchmark-protocol.yaml")
    const environment = manifest("execution-environment.yaml")
    const run = manifest("benchmark-run.yaml")
    if (workload.kind !== "WorkloadCase") throw new Error("wrong kind")
    if (implementation.kind !== "ImplementationRevision")
      throw new Error("wrong kind")
    if (run.kind !== "BenchmarkRun") throw new Error("wrong kind")

    const suite = manifest("workload-suite.yaml")
    if (suite.kind !== "WorkloadSuite") throw new Error("wrong kind")
    expect(suite.spec.operationSpecDigest).toBe(specDigest(operation))
    expect(workload.spec.operationSpecDigest).toBe(specDigest(operation))
    expect(implementation.spec.operation.specDigest).toBe(specDigest(operation))
    expect(run.spec.implementationDigest).toBe(specDigest(implementation))
    expect(run.spec.workloadDigest).toBe(specDigest(workload))
    expect(run.spec.protocolDigest).toBe(specDigest(protocol))
    expect(run.spec.environmentDigest).toBe(specDigest(environment))
  })

  it("the serving digest chain is consistent", () => {
    const model = manifest("model-revision.yaml")
    const stack = manifest("serving-stack-revision.yaml")
    const configuration = manifest("serving-configuration.yaml")
    const workload = manifest("serving-workload.yaml")
    const run = manifest("serving-run.yaml")
    if (configuration.kind !== "ServingConfiguration")
      throw new Error("wrong kind")
    if (run.kind !== "ServingRun") throw new Error("wrong kind")
    expect(configuration.spec.stackDigest).toBe(specDigest(stack))
    expect(run.spec.modelDigest).toBe(specDigest(model))
    expect(run.spec.configurationDigest).toBe(specDigest(configuration))
    expect(run.spec.workloadDigest).toBe(specDigest(workload))
  })
})
