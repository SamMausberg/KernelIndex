// Builds the illustrative registry-examples bundle used by the seed script
// and integration tests. The "illustrative" source kind makes every derived
// page model carry the illustrative label.
import { readFileSync } from "node:fs"
import path from "node:path"
import type { AnyManifest, ManifestKind } from "../../schemas/kinds.ts"
import { parseManifestText } from "../../schemas/parse.ts"
import type { ImportBundle } from "./publication.ts"

const examplesDir = path.resolve(
  import.meta.dirname,
  "../../../../../registry/examples",
)

function load<K extends ManifestKind>(
  file: string,
  kind: K,
): Extract<AnyManifest, { kind: K }> {
  const manifest = parseManifestText(
    readFileSync(path.join(examplesDir, file), "utf8"),
  )
  if (manifest.kind !== kind)
    throw new Error(`${file}: expected ${kind}, found ${manifest.kind}`)
  return manifest as Extract<AnyManifest, { kind: K }>
}

export function exampleBundle(): ImportBundle {
  return {
    source: {
      slug: "registry-examples",
      kind: "illustrative",
      name: "Registry examples (illustrative)",
    },
    projects: [
      {
        manifest: load("software-project.yaml", "SoftwareProject"),
        slug: "meridian-kernels",
      },
    ],
    operations: [
      {
        manifest: load("operation-spec.yaml", "OperationSpec"),
        slug: "example-rmsnorm-h4096",
        aliases: ["rms_norm", "rmsnorm"],
      },
    ],
    workloads: [{ manifest: load("workload-case.yaml", "WorkloadCase") }],
    implementations: [
      {
        manifest: load(
          "implementation-revision.yaml",
          "ImplementationRevision",
        ),
        slug: "example-meridian-rmsnorm",
        projectSlug: "meridian-kernels",
      },
    ],
    runs: [
      {
        manifest: load("benchmark-run.yaml", "BenchmarkRun"),
        protocol: load("benchmark-protocol.yaml", "BenchmarkProtocol"),
        environment: load("execution-environment.yaml", "ExecutionEnvironment"),
      },
    ],
  }
}
