// Fixture precedent search (§12.8): the same precedents-v1 policy over the
// fixture corpus, so the API contract, CLI, and MCP tool exercise real
// scoring without a database. Every fixture run sits on the rmsnorm
// operation; the fused operation has declared support only.
import type {
  Precedent,
  PrecedentInput,
  PrecedentsModel,
} from "@/lib/catalog-models"
import { composeQuery, describeIntent, parseQuery } from "@/lib/search-query"
import {
  clampPrecedentLimit,
  PRECEDENT_POLICY_VERSION,
  scorePrecedent,
} from "@/server/policy/precedents"
import { B200, type FxRun, ILLUSTRATIVE, RANKED, RUNS, WORKLOADS } from "./data"
import { IMPLEMENTATIONS } from "./dossiers"

const RMSNORM = { name: "RMSNorm, hidden 4096", slug: "rmsnorm-h4096" }

export async function findPrecedents(
  input: PrecedentInput,
): Promise<PrecedentsModel> {
  const intent = parseQuery(composeQuery(input))
  const matched =
    /rms[\s_-]?norm|\bnorm\b/i.test(intent.text.join(" ")) ||
    intent.family === "rmsnorm"
  const target = matched ? { ...RMSNORM, family: "rmsnorm" } : null
  const base: PrecedentsModel = {
    illustrative: ILLUSTRATIVE,
    interpretation: target
      ? `${describeIntent(intent, target.name)}; precedents drawn from ${target.slug}`
      : `${describeIntent(intent, null)}; no indexed operation or family matched`,
    target,
    policyVersion: PRECEDENT_POLICY_VERSION,
    precedents: [],
    considered: 0,
  }
  if (!target) return base

  const eligible = RUNS.filter(
    (r) =>
      r.status === "passed" &&
      !r.retracted &&
      !r.supersededById &&
      !r.disputed &&
      (input.includeUnsourced || r.sourceAvailable),
  )
  const byImplementation = new Map<string, FxRun[]>()
  for (const run of eligible)
    byImplementation.set(run.impl.slug, [
      ...(byImplementation.get(run.impl.slug) ?? []),
      run,
    ])
  const leaderTraits = [
    ...new Set(
      RANKED.slice(0, 3).flatMap(
        (r) =>
          IMPLEMENTATIONS[r.impl.slug]?.techniques.map((t) => t.trait) ?? [],
      ),
    ),
  ]
  const request = {
    gpu: intent.gpu,
    architecture:
      intent.architecture ?? (intent.gpu ? B200.architecture : null),
    dtypes: intent.dtypes,
    axes: intent.axes,
    leaderTraits,
  }
  const precedents: Precedent[] = [...byImplementation.entries()].map(
    ([slug, runs]) => {
      const best = [...runs].sort((a, b) => a.latencyNs - b.latencyNs)[0]
      const techniques =
        IMPLEMENTATIONS[slug]?.techniques.map((t) => t.trait) ?? []
      const scored = scorePrecedent(request, {
        relation: { kind: "same" },
        hardwareModels: [B200.model],
        architectures: [B200.architecture],
        dtypes: ["bf16"],
        axes: runs.map((r) => ({ ...WORKLOADS[r.workloadId].axes })),
        bestRank: best.rank,
        bestEvidence: best.evidence,
        techniques,
      })
      return {
        implementation: { name: best.impl.name, slug },
        project: best.project,
        operation: RMSNORM,
        ...scored,
        bestRun: {
          runId: best.id,
          hardware: B200.model,
          primary: {
            metric: "latency",
            unit: "ns",
            statistic: "median",
            value: best.latencyNs,
            sampleCount: best.samples,
            uncertainty: best.ci ? { low: best.ci[0], high: best.ci[1] } : null,
          },
          rank: best.rank,
          cohortSize: best.rank === null ? null : RANKED.length,
          evidence: best.evidence,
        },
        language:
          IMPLEMENTATIONS[slug]?.interface.language ??
          (slug.includes("triton") ? "triton" : "cuda"),
        framework: "pytorch",
        license: best.license,
        sourceAvailable: best.sourceAvailable,
        techniques,
      }
    },
  )
  precedents.sort((a, b) => b.score - a.score)
  return {
    ...base,
    precedents: precedents.slice(0, clampPrecedentLimit(input.limit)),
    considered: precedents.length,
  }
}
