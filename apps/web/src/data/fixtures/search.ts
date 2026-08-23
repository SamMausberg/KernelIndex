// Fixture search resolution (§12): the same parser, chooser helpers, and
// bracketing derivations as the PostgreSQL backend, over the fixture corpus.
import type {
  NearestCase,
  OperationIndexEntry,
  OperationPageModel,
  PrimaryMetric,
  SearchInput,
  SearchPageModel,
} from "@/lib/catalog-models"
import {
  describeIntent,
  parseQuery,
  removeToken,
  type SearchIntent,
} from "@/lib/search-query"
import {
  type ChooserRun,
  chooserFacets,
  chooserMatch,
  rankChooserMatches,
} from "@/server/catalog/chooser"
import {
  type Bracket,
  bracketCases,
  bracketQuery,
} from "@/server/catalog/match"
import { computeSweep } from "@/server/catalog/sweep"
import {
  APACHE,
  B200,
  COHORT_2048,
  COHORT_OPTIONS_2048,
  digest,
  FIXTURE_SOURCE_REF,
  FRESH,
  ILLUSTRATIVE,
  RANKED,
  RUNS,
  rowFromRun,
  SUPPORTED_UNMEASURED,
  UNKNOWN_LICENSE,
  WORKLOADS,
  type WorkloadId,
} from "./data"

/** Chooser annotation via the same pure helpers as the postgres backend:
 * every measured fixture run sits on the rmsnorm operation (B200, bf16). */
async function annotatedMatches(
  intent: SearchIntent,
): Promise<OperationIndexEntry[]> {
  const entries = await getOperationIndex()
  const facets = chooserFacets(intent)
  if (facets === null) return entries
  const runs: ChooserRun[] = RUNS.filter(
    (r) => r.status === "passed" && !r.retracted && !r.supersededById,
  ).map((r) => ({
    hardwareModel: B200.model,
    hardwareArchitecture: B200.architecture,
    cudaMajor: 13,
    workloadDtypes: ["bf16"],
    sourceAvailable: r.sourceAvailable,
    primaryValue: r.latencyNs,
    primaryUnit: "ns",
  }))
  return rankChooserMatches(
    entries.map((entry) => ({
      ...entry,
      match: chooserMatch(entry.slug === "rmsnorm-h4096" ? runs : [], facets),
    })),
  )
}

/** The corpus index behind suggestions and browse (two fixture operations). */
export async function getOperationIndex(): Promise<OperationIndexEntry[]> {
  return [
    {
      name: "RMSNorm, hidden 4096",
      slug: "rmsnorm-h4096",
      family: "rmsnorm",
      aliases: ["rms_norm", "root mean square norm"],
      runs: 10,
      lastObservedAt: FRESH,
    },
    {
      name: "Fused residual + RMSNorm",
      slug: "fused-residual-rmsnorm",
      family: "fused-residual-rmsnorm",
      aliases: [],
      runs: 0,
      lastObservedAt: null,
    },
  ]
}

export async function searchCatalog(
  input: SearchInput,
): Promise<SearchPageModel> {
  const query = input.query.trim()
  // Deterministic error trigger for the design lab's error state.
  if (query === "__error__")
    throw new Error("Illustrative search failure (fixtures)")

  // Fixtures interpret queries through the same parser as PostgreSQL mode,
  // so tokens, parse errors, and the interpreted request behave identically.
  const intent = parseQuery(query)
  const shared = {
    facets: intent.facets.map((facet) => ({
      token: facet.token,
      display: facet.display,
      removeQuery: removeToken(query, facet.token),
    })),
    queryIssues: intent.issues,
    policy: {
      minimumTrust: intent.minimumTrust,
      license: intent.license,
      requireSource: intent.requireSource,
      requireInstallable: intent.requireInstallable,
    },
    overflow: { exact: 0, compatible: 0, supportedUnmeasured: 0, reported: 0 },
  }

  const matched = /rms[\s_-]?norm/i.test(query)
  const empty = query === ""
  // "norm" alone plausibly names both fixture operations. Mirroring the
  // postgres backend (§12.1), the most-measured candidate answers with the
  // interpretation stated; `choose` shows the full chooser.
  const ambiguous = !matched && !empty && intent.text.includes("norm")
  const autoResolve = ambiguous && input.choose !== true
  if (!matched && !autoResolve) {
    return {
      illustrative: ILLUSTRATIVE,
      query,
      interpretedQuery: empty
        ? "Search the index"
        : describeIntent(intent, null),
      ...shared,
      operation: null,
      browse: empty ? await getOperationIndex() : null,
      matches: ambiguous ? await annotatedMatches(intent) : null,
      cohort: null,
      cohortOptions: [],
      groups: {
        exact: [],
        compatible: [],
        supportedUnmeasured: [],
        reported: [],
      },
      related: [],
      sources: [],
      noResult:
        empty || ambiguous
          ? null
          : {
              guidance:
                "No comparable public evidence found. Search by operation, shape, dtype, hardware, and framework.",
              suggestions: [
                {
                  label: "RMSNorm, hidden 4096",
                  query: "op:rmsnorm-h4096",
                },
                {
                  label: "rmsnorm bf16 pytorch",
                  query: "rmsnorm bf16 pytorch",
                },
              ],
            },
      nearest: null,
    }
  }

  const alternates = autoResolve
    ? (await annotatedMatches(intent)).filter(
        (entry) => entry.slug !== "rmsnorm-h4096",
      )
    : null
  const resolved: SearchPageModel = {
    illustrative: ILLUSTRATIVE,
    query,
    interpretedQuery: describeIntent(intent, "RMSNorm, hidden 4096"),
    ...shared,
    operation: { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" },
    browse: null,
    matches: alternates,
    cohort: COHORT_2048,
    cohortOptions: COHORT_OPTIONS_2048,
    groups: {
      exact: RANKED.map(rowFromRun),
      compatible: RUNS.filter((r) => r.match === "compatible").map(rowFromRun),
      supportedUnmeasured: [SUPPORTED_UNMEASURED],
      reported: RUNS.filter(
        (r) => r.evidence === "reported" && !r.retracted,
      ).map(rowFromRun),
    },
    related: [
      {
        kind: "operation",
        name: "Fused residual + RMSNorm",
        slug: "fused-residual-rmsnorm",
        summary: "Residual addition fused with RMSNorm (illustrative)",
      },
      {
        kind: "project",
        name: "Meridian Kernels (fictional)",
        slug: "meridian-kernels",
        summary: "Illustrative Triton kernel collection",
      },
    ],
    sources: [FIXTURE_SOURCE_REF],
    noResult: null,
    nearest: null,
  }

  // A case binding off the fixture workloads: the bracketed state (§12.5),
  // the same way the PostgreSQL read derives it.
  const cases = Object.values(WORKLOADS).map((w) => ({
    id: w.id,
    axes: { ...w.axes },
    shape: [w.axes.tokens, w.axes.hidden],
    dtypes: ["bf16"],
  }))
  const bindsCase = intent.shape !== null || Object.keys(intent.axes).length > 0
  const measured = cases.some(
    (entry) =>
      (intent.shape === null ||
        entry.shape.every((dim, index) => dim === intent.shape?.[index])) &&
      Object.entries(intent.axes).every(
        ([axis, value]) =>
          (entry.axes as Record<string, number>)[axis] === value,
      ),
  )
  if (!bindsCase || measured) return resolved
  const bracket = bracketCases(intent, cases)
  const side = (
    entry: { id: string; value: number } | null,
  ): NearestCase | null => {
    if (entry === null) return null
    const runs = RUNS.filter(
      (r) =>
        r.workloadId === entry.id &&
        r.status === "passed" &&
        !r.retracted &&
        !r.supersededById &&
        !r.disputed,
    ).sort((a, b) => a.latencyNs - b.latencyNs)
    const head = runs[0]
    return {
      workloadId: entry.id,
      label: WORKLOADS[entry.id as WorkloadId].label,
      value: entry.value,
      runs: runs.length,
      head: head
        ? {
            runId: head.id,
            implementation: { name: head.impl.name, slug: head.impl.slug },
            primary: rowFromRun(head).primary as PrimaryMetric,
          }
        : null,
      cohortKey: digest(`cohort:rmsnorm-h4096:tokens-${entry.value}`),
      query: bracketQuery(query, bracket as Bracket, entry.value),
    }
  }
  const requested = String(bracket?.requested ?? intent.axes.tokens ?? "")
  return {
    ...resolved,
    groups: {
      exact: [],
      compatible: RANKED.map((r) => ({
        ...rowFromRun(r),
        match: "compatible" as const,
        rank: null,
        cohortSize: null,
        mismatches: [{ field: "axes.tokens", requested, observed: "2048" }],
      })),
      supportedUnmeasured: [SUPPORTED_UNMEASURED],
      reported: [],
    },
    nearest:
      bracket === null
        ? null
        : {
            axis: bracket.axis,
            requested: bracket.requested,
            below: side(bracket.below),
            above: side(bracket.above),
          },
  }
}

export async function getOperationPage(
  slug: string,
  workload?: string,
  _cohort?: string,
): Promise<OperationPageModel | null> {
  if (slug !== "rmsnorm-h4096") return null
  const selected: WorkloadId =
    workload === "wl-1024" || workload === "wl-4096" ? workload : "wl-2048"
  const records =
    selected === "wl-2048"
      ? RANKED.map(rowFromRun)
      : RUNS.filter((r) => r.workloadId === selected).map(rowFromRun)
  // Same sweep derivation as the postgres backend: every eligible run joins
  // (match quality is query-relative, not a cohort fact), and the fixture
  // corpus shares one environment/protocol, so the constant key is constant.
  const sweep = computeSweep({
    anchorWorkloadId: selected,
    anchorConstantKey: "fixture",
    environmentLabel: `${B200.model} · CUDA 13.1 · PyTorch 2.9.0 · ki-fixed-clock v1`,
    metricLabel: "latency · median",
    unit: "ns",
    lowerIsBetter: true,
    runs: RUNS.filter(
      (r) => r.status === "passed" && !r.retracted && !r.supersededById,
    ).map((r) => ({
      workloadId: r.workloadId,
      implementation: { name: r.impl.name, slug: r.impl.slug },
      value: r.latencyNs,
      constantKey: "fixture",
    })),
    workloadAxes: new Map(
      Object.values(WORKLOADS).map((w) => [w.id, { ...w.axes }]),
    ),
  })
  return {
    illustrative: ILLUSTRATIVE,
    operation: {
      id: "op-fx-rmsnorm-h4096",
      slug: "rmsnorm-h4096",
      name: "RMSNorm, hidden 4096",
      family: "rmsnorm",
      aliases: ["rms_norm", "RMSLayerNorm"],
      equivalents: [],
      models: ["llama-3.1-8b"],
      semanticDigest: digest("operation:rmsnorm-h4096"),
      summary:
        "Root-mean-square normalization over the last axis with a learned scale, bf16 in and out with fp32 accumulation.",
      supersededById: null,
    },
    semantics: {
      inputs: [
        {
          name: "input",
          dtype: "bf16",
          shape: "[tokens, hidden]",
          layout: "row_major",
        },
        {
          name: "weight",
          dtype: "bf16",
          shape: "[hidden]",
          layout: "contiguous",
        },
        { name: "epsilon", dtype: "fp32", shape: "scalar", layout: null },
      ],
      outputs: [
        {
          name: "output",
          dtype: "bf16",
          shape: "[tokens, hidden]",
          layout: "row_major",
        },
      ],
      axes: [
        {
          name: "tokens",
          role: "variable",
          value: null,
          constraint: "tokens >= 1",
        },
        { name: "hidden", role: "constant", value: 4096, constraint: null },
      ],
      expression:
        "output = cast_bf16(input * rsqrt(mean(cast_fp32(input)^2, axis=-1) + epsilon) * weight)",
      determinism: "deterministic",
      constraints: ["No mutation or aliasing", "fp32 accumulator"],
    },
    workloads: Object.values(WORKLOADS).map((w) => ({
      id: w.id,
      digest: w.digest,
      label: w.label,
      axes: { ...w.axes },
      dtypes: ["bf16"],
      toleranceSummary: w.toleranceSummary,
    })),
    selectedWorkloadId: selected,
    cohortOptions: selected === "wl-2048" ? COHORT_OPTIONS_2048 : [],
    cohort: selected === "wl-2048" ? COHORT_2048 : null,
    records,
    sweep,
    implementations: [
      {
        slug: "meridian-rmsnorm",
        name: "meridian-rmsnorm",
        project: {
          name: "Meridian Kernels (fictional)",
          slug: "meridian-kernels",
        },
        language: "triton",
        framework: "pytorch",
        evidence: "verified",
        bestPrimary: rowFromRun(RUNS[1]).primary,
        sourceAvailable: true,
        installable: true,
        license: APACHE,
      },
      {
        slug: "ionflux-rmsnorm",
        name: "ionflux-rmsnorm",
        project: { name: "IonFlux (fictional)", slug: "ionflux" },
        language: "cuda",
        framework: "pytorch",
        evidence: "verified",
        bestPrimary: rowFromRun(RUNS[0]).primary,
        sourceAvailable: false,
        installable: false,
        license: UNKNOWN_LICENSE,
      },
      {
        slug: "atlas-fused-residual-rmsnorm",
        name: "atlas-fused-residual-rmsnorm-vectorized-bf16-persistent-warp-specialized",
        project: {
          name: "Atlas Primitives (fictional)",
          slug: "atlas-primitives",
        },
        language: "cuda",
        framework: null,
        evidence: null,
        bestPrimary: null,
        sourceAvailable: true,
        installable: true,
        license: APACHE,
      },
    ],
    coverage: {
      verified: 5,
      reproducible: 3,
      reported: 2,
      lastObservedAt: FRESH,
    },
    sources: [
      {
        name: "Illustrative fixture source",
        kind: "fixture",
        url: null,
        license: null,
        externalId: null,
        observedAt: FRESH,
      },
    ],
  }
}
