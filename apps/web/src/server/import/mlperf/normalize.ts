// MLPerf-to-KernelIndex normalization (§14.5): summary rows become serving
// manifests. Everything the row or the published rules state is preserved;
// nothing else is guessed — unstated fields stay absent. Declared TTFT/TPOT
// bounds ride the workload as cited SLO facts (RULES_URL), not measurements.
import type {
  ModelRevisionManifest,
  ServingConfigurationManifest,
  ServingRunManifest,
  ServingStackRevisionManifest,
  ServingWorkloadManifest,
  SoftwareProjectManifest,
} from "../../../schemas/kinds.ts"
import { parseManifestDocument } from "../../../schemas/parse.ts"
import { kebab } from "../shared.ts"
import {
  BENCHMARKS,
  MLPERF_SOURCE,
  type MlperfRound,
  type MlperfRow,
  RULES_URL,
} from "./types.ts"

const manifest = <K extends string>(kind: K, document: unknown) => {
  const parsed = parseManifestDocument(document)
  if (parsed.kind !== kind) throw new Error("unreachable")
  return parsed as Extract<
    ReturnType<typeof parseManifestDocument>,
    { kind: K }
  >
}

const tokenize = (value: string) =>
  value
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^[^a-z]+/, "")
    .replace(/_+$/, "") || "unknown"

/** "llama2-70b-99.9" → base model slug "mlperf-llama2-70b". */
export const modelSlugOf = (benchmark: string) =>
  `mlperf-${kebab(benchmark.replace(/-99(\.9)?$/, ""))}`

export function modelRevisionFor(benchmark: string): {
  manifest: ModelRevisionManifest
  slug: string
} {
  const spec = BENCHMARKS[benchmark]
  const slug = modelSlugOf(benchmark)
  return {
    manifest: manifest("ModelRevision", {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "ModelRevision",
      metadata: {
        name: slug,
        title: spec.model,
        sourceRefs: [{ url: RULES_URL }],
      },
      spec: { model: spec.model },
    }) as ModelRevisionManifest,
    slug,
  }
}

const KNOWN_VENDORS = new Set(["nvidia", "amd", "intel", "google", "cerebras"])

/** "AMD Instinct MI355X 288GB HBM3e (x87)" → vendor + clean model name. */
export function acceleratorOf(raw: string): {
  vendor: string | undefined
  model: string
} {
  const model = raw.replace(/\s*\(x\d+\)\s*$/, "").trim()
  const first = model.split(/\s+/)[0]?.toLowerCase() ?? ""
  return { vendor: KNOWN_VENDORS.has(first) ? first : undefined, model }
}

export function projectFor(submitter: string): {
  manifest: SoftwareProjectManifest
  slug: string
} {
  const slug = `mlperf-${kebab(submitter)}`
  return {
    manifest: manifest("SoftwareProject", {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "SoftwareProject",
      metadata: { name: slug },
      spec: {
        name: `${submitter} (MLPerf submitter)`,
        kind: "vendor",
        repository: MLPERF_SOURCE.policy.url,
      },
    }) as SoftwareProjectManifest,
    slug,
  }
}

/** The stack identity is the Software string exactly as submitted; the
 * title carries it for display so surfaces never show the kebab slug. */
export function stackFor(row: MlperfRow): {
  manifest: ServingStackRevisionManifest
  slug: string
  projectSlug: string
} {
  const name = row.Software.trim().slice(0, 200)
  return {
    manifest: manifest("ServingStackRevision", {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "ServingStackRevision",
      metadata: {
        name: kebab(`mlperf-stack-${row.Submitter}-${name}`).slice(0, 200),
        title: name,
      },
      spec: {
        project: { name: `${row.Submitter} (MLPerf submitter)` },
        revision: { version: row.Software.trim().slice(0, 120) },
        apiProtocol: "loadgen_sut",
      },
    }) as ServingStackRevisionManifest,
    slug: kebab(`mlperf-stack-${row.Submitter}-${name}`).slice(0, 100),
    projectSlug: `mlperf-${kebab(row.Submitter)}`,
  }
}

export function configurationFor(
  row: MlperfRow,
  stackDigest: string,
): { manifest: ServingConfigurationManifest; summary: string } {
  const options: Record<string, string> = {
    system: row.System.slice(0, 500),
    software: row.Software.slice(0, 500),
    availability: row.Availability.slice(0, 500),
  }
  if (row.Notes) options.notes = row.Notes.slice(0, 500)
  return {
    manifest: manifest("ServingConfiguration", {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "ServingConfiguration",
      metadata: {
        name: kebab(`mlperf-${row.Submitter}-${row.System}`).slice(0, 200),
      },
      spec: {
        stackDigest,
        ...(row.weight_data_types
          ? { dtype: tokenize(row.weight_data_types) }
          : {}),
        options,
      },
    }) as ServingConfigurationManifest,
    summary: `${row.Submitter} · ${row.System}`,
  }
}

export function workloadFor(
  benchmark: string,
  scenario: string,
): { manifest: ServingWorkloadManifest; slug: string; name: string } {
  const spec = BENCHMARKS[benchmark]
  const slo = spec.slo[scenario as "Server" | "Interactive"]
  const slug = kebab(`mlperf-${benchmark}-${scenario}`)
  return {
    manifest: manifest("ServingWorkload", {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "ServingWorkload",
      metadata: {
        name: slug,
        title: `${benchmark} · ${scenario}`,
        // The declared bounds cite the published rules, never memory.
        sourceRefs: [{ url: RULES_URL }],
      },
      spec: {
        dataset: { name: spec.dataset },
        streaming: scenario !== "Offline",
        loadGeneration: scenario === "Offline" ? "offline" : "open_loop",
        ...(scenario === "Offline" ? {} : { arrival: "poisson" }),
        ...(slo
          ? {
              slo: [
                {
                  metric: "ttft_ms",
                  statistic: "p99",
                  operator: "<=",
                  value: slo.ttftMs,
                  unit: "ms",
                },
                {
                  metric: "tpot_ms",
                  statistic: "p99",
                  operator: "<=",
                  value: slo.tpotMs,
                  unit: "ms",
                },
              ],
            }
          : {}),
      },
    }) as ServingWorkloadManifest,
    slug,
    name: `${benchmark} · ${scenario}`,
  }
}

export function runFor(input: {
  row: MlperfRow
  round: MlperfRound
  modelDigest: string
  configurationDigest: string
  workloadDigest: string
}): ServingRunManifest {
  const { row, round } = input
  const accelerator = acceleratorOf(row.Accelerator)
  const quality = tokenize(BENCHMARKS[row.Model].quality)
  return manifest("ServingRun", {
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "ServingRun",
    metadata: {
      name: kebab(`mlperf-${round.round}-${row.ID}`),
      title: `${row.Submitter} · ${row.Model} · ${row.Scenario}`,
      sourceRefs: row.Details ? [{ url: row.Details }] : undefined,
    },
    spec: {
      modelDigest: input.modelDigest,
      configurationDigest: input.configurationDigest,
      workloadDigest: input.workloadDigest,
      topology: {
        ...(accelerator.vendor
          ? { acceleratorVendor: accelerator.vendor }
          : {}),
        acceleratorModel: accelerator.model,
        acceleratorsPerNode: row["a#"],
        nodeCount: row.Nodes,
      },
      harness: { name: "mlperf_loadgen", version: round.round },
      qualityPolicy: quality,
      status: "valid",
      measurements: [
        {
          metric: "output_token_throughput_tps",
          unit: "tokens_s",
          statistic: "reported",
          value: row.Performance_Result,
        },
      ],
      sourceNative: {
        source: MLPERF_SOURCE.slug,
        benchmark: row.Model,
        scenario: tokenize(row.Scenario),
        division: "closed",
        category: "datacenter",
        externalId: `${round.round}/${row.ID}`,
        metrics: {
          performance_result: row.Performance_Result,
          performance_units: row.Performance_Units,
        },
      },
      ...(row.Availability !== "available"
        ? { caveats: [`Availability: ${row.Availability}`] }
        : {}),
      observedAt: round.publishedAt,
    },
  }) as ServingRunManifest
}
