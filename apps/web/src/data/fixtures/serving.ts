// Deterministic illustrative serving fixtures (§27.5): fictional stacks and
// numbers exercising the resolver's states — a multi-metric Pareto trade-off,
// an unreported-metric exclusion, and a second, incomparable cohort. Every
// model carries `illustrative: true`; nothing here is real evidence.
import type {
  ServingCohortGroup,
  ServingConfigurationSummary,
  ServingConstraintView,
  ServingFacetsModel,
  ServingOverviewModel,
  ServingResolveInput,
  ServingResolveModel,
  ServingResultRow,
  ServingRunPageModel,
  ServingRunSummary,
} from "@/lib/serving-models"
import {
  feasibility,
  paretoFrontier,
  rankByObjective,
  SERVING_POLICY_VERSION,
  type ServingCandidate,
} from "@/server/policy/serving"

const MODEL = { name: "Aurora-70B (fictional)", slug: "aurora-70b" }
const HW = "NVIDIA B200 SXM"

type FxServingRun = {
  id: string
  stack: string
  configuration: string
  dtype: string
  scenario: "Interactive" | "Offline"
  streaming: boolean
  measurements: {
    metric: string
    statistic: string
    value: number
    unit: string
  }[]
  caveats?: string[]
}

const M = (metric: string, statistic: string, value: number, unit: string) => ({
  metric,
  statistic,
  value,
  unit,
})

// Cohort A (interactive, streaming): a genuine latency/throughput trade-off.
const INTERACTIVE: FxServingRun[] = [
  {
    id: "srv-fx-0001",
    stack: "Heliograph Serve 2.1 (fictional)",
    configuration: "tp8 · fp8 kv · chunked prefill",
    dtype: "fp8",
    scenario: "Interactive",
    streaming: true,
    measurements: [
      M("output_token_throughput_tps", "reported", 41800, "tokens/s"),
      M("ttft_ms", "p99", 380, "ms"),
      M("tpot_ms", "p99", 21, "ms"),
      M("error_rate", "reported", 0, "ratio"),
    ],
  },
  {
    id: "srv-fx-0002",
    stack: "Heliograph Serve 2.1 (fictional)",
    configuration: "tp8 · bf16 · latency tuned",
    dtype: "bf16",
    scenario: "Interactive",
    streaming: true,
    measurements: [
      M("output_token_throughput_tps", "reported", 28900, "tokens/s"),
      M("ttft_ms", "p99", 190, "ms"),
      M("tpot_ms", "p99", 12, "ms"),
      M("error_rate", "reported", 0, "ratio"),
    ],
  },
  {
    id: "srv-fx-0003",
    stack: "Windvane Engine 0.9 (fictional)",
    configuration: "tp4 pp2 · fp8 · speculative",
    dtype: "fp8",
    scenario: "Interactive",
    streaming: true,
    measurements: [
      M("output_token_throughput_tps", "reported", 36400, "tokens/s"),
      M("ttft_ms", "p99", 265, "ms"),
      M("tpot_ms", "p99", 16, "ms"),
      M("error_rate", "reported", 0, "ratio"),
    ],
    caveats: ["Speculative decoding accepted under the fixture quality policy"],
  },
  {
    id: "srv-fx-0004",
    stack: "Windvane Engine 0.9 (fictional)",
    configuration: "tp8 · fp8 · throughput tuned",
    dtype: "fp8",
    scenario: "Interactive",
    streaming: true,
    measurements: [
      M("output_token_throughput_tps", "reported", 30100, "tokens/s"),
      M("ttft_ms", "p99", 410, "ms"),
      M("tpot_ms", "p99", 24, "ms"),
      M("error_rate", "reported", 0, "ratio"),
    ],
  },
  {
    // Throughput-only row: excluded under a TTFT constraint, flagged on the
    // Pareto axes otherwise.
    id: "srv-fx-0005",
    stack: "Windvane Engine 0.9 (fictional)",
    configuration: "tp8 · fp8 · batch offline profile",
    dtype: "fp8",
    scenario: "Interactive",
    streaming: true,
    measurements: [
      M("output_token_throughput_tps", "reported", 44100, "tokens/s"),
    ],
    caveats: ["Latency percentiles not reported by the fixture source"],
  },
]

// Cohort B (offline, non-streaming): never comparable with cohort A.
const OFFLINE: FxServingRun[] = [
  {
    id: "srv-fx-0006",
    stack: "Heliograph Serve 2.1 (fictional)",
    configuration: "tp8 · fp8 · offline batch",
    dtype: "fp8",
    scenario: "Offline",
    streaming: false,
    measurements: [
      M("output_token_throughput_tps", "reported", 61200, "tokens/s"),
    ],
  },
  {
    id: "srv-fx-0007",
    stack: "Windvane Engine 0.9 (fictional)",
    configuration: "tp8 · fp8 · offline batch",
    dtype: "fp8",
    scenario: "Offline",
    streaming: false,
    measurements: [
      M("output_token_throughput_tps", "reported", 58400, "tokens/s"),
    ],
  },
]

const ALL = [...INTERACTIVE, ...OFFLINE]

const digest = (seed: string): string => {
  let h = 0x811c9dc5
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0
  return `sha256:${h.toString(16).padStart(8, "0").repeat(8)}`
}

const workloadOf = (run: FxServingRun) =>
  run.scenario === "Interactive"
    ? "interactive-chat-trace"
    : "offline-batch-trace"

const candidateOf = (run: FxServingRun): ServingCandidate => ({
  runId: run.id,
  measurements: run.measurements,
  declaredSlo: [],
})

function resultRow(
  run: FxServingRun,
  constraints: ServingConstraintView[],
): ServingResultRow {
  return {
    runId: run.id,
    rank: null,
    onFrontier: false,
    model: MODEL,
    stack: run.stack,
    configuration: run.configuration,
    dtype: run.dtype,
    qualityPolicy: "exact_model",
    scenario: run.scenario,
    hardware: { model: HW, perNode: 8, nodes: 1, total: 8 },
    harness: "fixture-harness v1",
    measurements: run.measurements,
    constraints,
    caveats: run.caveats ?? [],
    observedAt: "2026-08-10T09:30:00Z",
    source: { name: "Illustrative fixtures", externalId: run.id, url: null },
  }
}

function group(
  runs: FxServingRun[],
  input: ServingResolveInput,
): ServingCohortGroup {
  const first = runs[0]
  const feasible: FxServingRun[] = []
  const excluded: ServingCohortGroup["excluded"] = []
  const views = new Map<string, ServingConstraintView[]>()
  for (const run of runs) {
    const result = feasibility(candidateOf(run), input.constraints ?? [])
    views.set(
      run.id,
      Object.entries(result.outcomes).map(([constraint, outcome]) => ({
        constraint,
        state: outcome.state,
        satisfied: outcome.state === "unknown" ? null : outcome.satisfied,
        detail:
          outcome.state === "measured"
            ? `measured ${outcome.observed}`
            : outcome.state === "declared"
              ? `benchmark constraint ≤ ${outcome.bound}, not measured`
              : "not reported",
      })),
    )
    if (result.feasible) feasible.push(run)
    else
      excluded.push({
        runId: run.id,
        configuration: run.configuration,
        reasons: result.reasons,
      })
  }
  const candidates = feasible.map(candidateOf)
  const { frontier } = paretoFrontier(candidates)
  const ranks = input.objective
    ? new Map(
        rankByObjective(candidates, input.objective).map((r) => [
          r.runId,
          r.rank,
        ]),
      )
    : null
  const axisSets = candidates.map(
    (c) => new Set(c.measurements.map((m) => `${m.metric}·${m.statistic}`)),
  )
  const sharedAxes = [...(axisSets[0] ?? new Set<string>())].filter((axis) =>
    axisSets.every((set) => set.has(axis)),
  )
  const rows = feasible.map((run) => ({
    ...resultRow(run, views.get(run.id) ?? []),
    rank: ranks?.get(run.id) ?? null,
    onFrontier: frontier.includes(run.id),
  }))
  rows.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
  return {
    cohortKey: digest(`serving-cohort:${first.scenario}`),
    description: [
      MODEL.name,
      workloadOf(first),
      first.scenario,
      `8× ${HW}`,
      "exact_model",
    ].join(" · "),
    identity: {
      model: MODEL.name,
      workload: workloadOf(first),
      scenario: first.scenario,
      topology: `8× ${HW}`,
      quality: "exact_model",
    },
    rows,
    excluded,
    sharedAxes,
  }
}

/** Overview twin: one row per fixture workload, best throughput leading. */
export async function getServingOverview(): Promise<ServingOverviewModel> {
  const throughput = (run: FxServingRun) =>
    run.measurements.find((m) => m.metric === "output_token_throughput_tps")
      ?.value ?? null
  const rows = (["Interactive", "Offline"] as const).map((scenario) => {
    const runs = ALL.filter((run) => run.scenario === scenario)
    const best = runs
      .filter((run) => throughput(run) !== null)
      .sort((a, b) => (throughput(b) ?? 0) - (throughput(a) ?? 0))[0]
    return {
      model: MODEL,
      workload: {
        slug: workloadOf(runs[0]),
        name: workloadOf(runs[0]).replaceAll("-", " "),
      },
      scenario,
      runs: runs.length,
      configurations: new Set(runs.map((run) => run.configuration)).size,
      best: best
        ? {
            runId: best.id,
            throughput: throughput(best) as number,
            stack: best.stack,
            hardware: HW,
            totalAccelerators: 8,
          }
        : null,
    }
  })
  return { illustrative: true, rows }
}

export async function getServingFacets(): Promise<ServingFacetsModel> {
  const model = await resolveServing({})
  const { metrics: _metrics, ...facets } = model.facets
  return { illustrative: true, ...facets, totalRuns: model.totalRuns }
}

export async function resolveServing(
  input: ServingResolveInput,
): Promise<ServingResolveModel> {
  const wanted = ALL.filter(
    (run) =>
      (input.workload === undefined || workloadOf(run) === input.workload) &&
      (input.model === undefined || input.model === MODEL.slug) &&
      (input.hardware?.countMaximum === undefined ||
        input.hardware.countMaximum >= 8),
  )
  const groups = (["Interactive", "Offline"] as const)
    .map((scenario) => wanted.filter((run) => run.scenario === scenario))
    .filter((runs) => runs.length > 0)
    .map((runs) => group(runs, input))
  return {
    illustrative: true,
    input,
    facets: {
      models: [{ ...MODEL, runs: ALL.length }],
      workloads: [
        {
          slug: "interactive-chat-trace",
          name: "interactive chat trace",
          runs: 5,
        },
        { slug: "offline-batch-trace", name: "offline batch trace", runs: 2 },
      ],
      hardware: [HW],
      metrics: ["output_token_throughput_tps", "ttft_ms", "tpot_ms"],
    },
    groups,
    totalRuns: ALL.length,
    policyVersion: SERVING_POLICY_VERSION,
    generatedAt: "2026-08-10T09:30:00Z",
  }
}

export async function getServingRunPage(
  id: string,
): Promise<ServingRunPageModel | null> {
  const run = ALL.find((entry) => entry.id === id)
  if (!run) return null
  return {
    illustrative: true,
    run: {
      id: run.id,
      digest: digest(`serving-run:${run.id}`),
      status: "valid",
      observedAt: "2026-08-10T09:30:00Z",
      publishedAt: "2026-08-10T09:30:00Z",
    },
    cohort: {
      key: digest(`serving-cohort:${run.scenario}`),
      description: [
        MODEL.name,
        workloadOf(run),
        run.scenario,
        `8× ${HW}`,
        "exact_model",
      ].join(" · "),
      qualityPolicy: "exact_model",
      scenario: run.scenario,
    },
    model: { ...MODEL, license: null },
    stack: { name: run.stack, version: null },
    configuration: {
      summary: run.configuration,
      dtype: run.dtype,
      quantization: null,
      facts: [{ key: "profile", value: run.configuration }],
    },
    workload: {
      name: workloadOf(run),
      streaming: run.streaming,
      loadGeneration: run.streaming ? "open_loop" : "offline",
    },
    topology: { acceleratorModel: HW, perNode: 8, nodes: 1, total: 8 },
    harness: "fixture-harness v1",
    measurements: run.measurements,
    caveats: run.caveats ?? [],
    lifecycle: { retracted: null },
    attribution: { line: "Illustrative fixtures", url: null },
    manifest: {
      apiVersion: "kernelindex.dev/v1alpha1",
      kind: "ServingRun",
      metadata: { name: run.id, illustrative: true },
      spec: { measurements: run.measurements },
    },
  }
}

export async function listServingRuns(_input: {
  cursor?: string
  limit?: number
}): Promise<{ runs: ServingRunSummary[]; nextCursor: string | null }> {
  return {
    runs: ALL.map((run) => ({
      id: run.id,
      model: MODEL.name,
      stack: run.stack,
      configuration: run.configuration,
      scenario: run.scenario,
      hardware: HW,
      totalAccelerators: 8,
      observedAt: "2026-08-10T09:30:00Z",
    })),
    nextCursor: null,
  }
}

export async function listServingConfigurations(): Promise<
  ServingConfigurationSummary[]
> {
  return ALL.map((run) => ({
    id: run.id,
    digest: digest(`serving-configuration:${run.id}`),
    stack: run.stack,
    summary: run.configuration,
    dtype: run.dtype,
    runs: 1,
  }))
}
