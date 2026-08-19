// FlashInfer-to-KernelIndex normalization (§14.5). Definitions, workload
// entries, and traces reuse the SOL mappers — FlashInfer-Bench defines the
// trace schema SOL adopted — while the solution document maps here: its
// Apache-2.0 sources are mirrored inline exactly like KernelBot code.
import type {
  BenchmarkProtocolManifest,
  ImplementationRevisionManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import type { BundleArtifact } from "../../catalog/publication.ts"
import { sha256Digest } from "../../identity/digest.ts"
import { kebab } from "../shared.ts"
import {
  mapDtype,
  mapHardware,
  mapLanguage,
  operationArgumentsOf,
} from "../sol/normalize.ts"
import type { SolDefinition } from "../sol/types.ts"
import { DATASET_URL, type FiSolution, HARNESS_REPO } from "./types.ts"

export const FLASHINFER_CODE_LICENSE = "Apache-2.0"

/** Trace-format protocol under the FlashInfer-Bench harness identity. */
export function fiTraceProtocol(): BenchmarkProtocolManifest {
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "BenchmarkProtocol",
    metadata: {
      name: "flashinfer-bench-trace",
      title: "FlashInfer-Bench trace harness",
    },
    spec: {
      harness: { name: "flashinfer-bench", repository: HARNESS_REPO },
      measurement: { timer: "harness_reported", primaryStatistic: "mean" },
      correctness: {
        reference: "definition reference implementation",
        comparator: "flashinfer_bench_eval",
      },
      comparability: { family: "flashinfer_bench_trace" },
    },
  })
  if (manifest.kind !== "BenchmarkProtocol") throw new Error("unreachable")
  return manifest
}

export function projectForAuthor(author: string | null): {
  manifest: ReturnType<typeof parseManifestDocument>
  slug: string
} {
  const label = author?.trim() || "unknown"
  const slug = `flashinfer-${kebab(label)}`
  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "SoftwareProject",
    metadata: { name: slug },
    spec: {
      name: label === "baseline" ? "FlashInfer-Bench baselines" : label,
      repository: DATASET_URL,
      host: { kind: "huggingface", id: "flashinfer-ai/flashinfer-trace" },
    },
  })
  return { manifest, slug }
}

/** Solution → implementation with mirrored Apache-2.0 source (§8.13). */
export function implementationFromFiSolution(input: {
  solution: FiSolution
  definition: SolDefinition
  operationSpecDigest: string
  revision: string
  path: string
}): {
  manifest: ImplementationRevisionManifest
  slug: string
  projectSlug: string
  externalId: string
  artifacts?: BundleArtifact[]
} {
  const { solution } = input
  const spec = solution.spec ?? {}
  const products = (spec.target_hardware ?? [])
    .filter((name) => name !== "LOCAL")
    .map((name) => mapHardware(name))
  const [entryPath, entrySymbol] = (spec.entry_point ?? "").split("::")
  const primary =
    (solution.sources ?? []).find((source) => source.path === entryPath) ??
    (solution.sources ?? [])[0]
  const code = primary && primary.content.length > 0 ? primary.content : null
  const codeDigest = code !== null ? sha256Digest(code) : null

  const manifest = parseManifestDocument({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ImplementationRevision",
    metadata: {
      name: kebab(solution.name),
      title: solution.name,
      description: solution.description ?? undefined,
      // Upstream ships these as its designated baseline solutions; the role
      // keeps them from being presented as competing record holders.
      labels:
        (solution.author ?? "baseline") === "baseline"
          ? { role: "baseline" }
          : undefined,
      authors: solution.author ? [{ name: solution.author }] : undefined,
      sourceRefs: [
        { url: `${DATASET_URL}/blob/${input.revision}/${input.path}` },
      ],
    },
    spec: {
      projectRevision: { repository: DATASET_URL, commit: input.revision },
      operation: { specDigest: input.operationSpecDigest },
      callable: {
        language: mapLanguage(spec.language ?? "unknown"),
        path: primary?.path,
        symbol: entrySymbol || undefined,
      },
      support: {
        hardwareArchitectures:
          products.length > 0
            ? products.map((product) => product.architecture)
            : ["unknown"],
        productsTested: products.map((product) => product.product),
        dtypes: operationArgumentsOf(input.definition.inputs).map((argument) =>
          mapDtype(argument.dtype),
        ),
      },
      source:
        code !== null && codeDigest !== null
          ? {
              contentDigest: codeDigest,
              fileName: primary?.path,
              sizeBytes: Buffer.byteLength(code),
            }
          : undefined,
      licensing: { declared: "Apache-2.0", concluded: "Apache-2.0" },
    },
  })
  if (manifest.kind !== "ImplementationRevision") throw new Error("unreachable")
  return {
    manifest,
    slug: kebab(`flashinfer-${solution.name}`),
    projectSlug: projectForAuthor(solution.author ?? null).slug,
    externalId: input.path,
    artifacts:
      code !== null && codeDigest !== null
        ? [
            {
              role: "source",
              kind: "source",
              mediaType: primary?.path.endsWith(".py")
                ? "text/x-python"
                : primary?.path.endsWith(".cu")
                  ? "text/x-cuda"
                  : "text/plain",
              digest: codeDigest,
              sizeBytes: Buffer.byteLength(code),
              storage: "inline",
              content: code,
              uri: DATASET_URL,
              license: FLASHINFER_CODE_LICENSE,
            },
          ]
        : undefined,
  }
}
