// SOL importer goldens (§21.3): parse and normalization stability against
// committed real snapshots, drift/quarantine behavior, and (with a database)
// the full discover → reconcile → publish pipeline including idempotent
// re-import. DB assertions run inside a rolled-back transaction.
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { publishBundle } from "../../catalog/publication.ts"
import { db } from "../../db/client.ts"
import { specDigest } from "../../identity/digest.ts"
import { discoverLocal, type SolImportData } from "./discover.ts"
import {
  leaderboardEnvironment,
  leaderboardProtocol,
  operationFromDefinition,
  runFromSubmission,
  toUtcInstant,
} from "./normalize.ts"
import {
  parseDefinition,
  parseKernelDetail,
  parseKernelList,
  parseSubmissions,
  parseTraces,
} from "./parse.ts"
import { reconcile } from "./reconcile.ts"
import { type SolSubmission, solWorkloadEntry } from "./types.ts"

const fixtures = path.resolve(import.meta.dirname, "__fixtures__")
const read = (relative: string) =>
  readFileSync(path.join(fixtures, relative), "utf8")
const EXAMPLES_COMMIT = "a9fa0804c793d438e70850c33fe34426e66d53dd"

describe("sol parsing", () => {
  it("parses the real definition, submissions, kernels, and traces", () => {
    expect(
      parseDefinition(read("rmsnorm/definition.json"), "fx").values,
    ).toHaveLength(1)
    const kernels = parseKernelList(read("api/kernels.json"), "fx")
    expect(kernels.values.map((kernel) => kernel.id)).toEqual([4])
    const submissions = parseSubmissions(read("api/submissions.json"), "fx")
    expect(submissions.values.length).toBeGreaterThanOrEqual(2)
    expect(submissions.issues).toHaveLength(0)
    const traces = parseTraces(read("rmsnorm/trace.jsonl"), "fx")
    expect(traces.values).toHaveLength(2)
    expect(traces.values[1].evaluation?.status).toBe("INCORRECT_NUMERICAL")
  })

  it("quarantines invalid items instead of importing them", () => {
    const outcome = parseDefinition(`{"name": "broken"}`, "fx")
    expect(outcome.values).toHaveLength(0)
    expect(outcome.issues).toHaveLength(1)
  })

  it("reports unknown upstream fields as drift warnings", () => {
    const raw = JSON.parse(read("rmsnorm/definition.json"))
    raw.brand_new_upstream_field = true
    const outcome = parseDefinition(JSON.stringify(raw), "fx")
    expect(outcome.values).toHaveLength(1)
    expect(outcome.driftWarnings.join(" ")).toContain(
      "brand_new_upstream_field",
    )
  })
})

describe("sol normalization", () => {
  const definition = parseDefinition(read("rmsnorm/definition.json"), "fx")
    .values[0]

  it("maps a definition to a deterministic OperationSpec", () => {
    const first = operationFromDefinition(
      definition,
      "https://research.nvidia.com/x",
    )
    const second = operationFromDefinition(
      definition,
      "https://research.nvidia.com/x",
    )
    expect(first.slug).toBe("rmsnorm-h4096")
    expect(first.manifest.spec.family).toBe("rmsnorm")
    expect(first.manifest.spec.inputs[0]).toEqual({
      name: "hidden_states",
      tensor: { shape: ["batch_size", "hidden_size"], dtype: "bf16" },
    })
    expect(first.manifest.spec.axes.hidden_size).toEqual({
      role: "constant",
      type: "integer",
      value: 4096,
    })
    expect(first.manifest.spec.semantics.determinism).toBe("unspecified")
    expect(specDigest(first.manifest)).toBe(specDigest(second.manifest))
  })

  it("preserves per-case tolerances when a local workload declares them", () => {
    const entry = solWorkloadEntry.parse({
      uuid: "0f6d2c1e-aaaa-bbbb-cccc-000000000001",
      axes: { batch_size: 8 },
      inputs: { hidden_states: { type: "random" } },
      tolerance: { max_atol: 0.003, max_rtol: 0.02 },
    })
    expect(entry.tolerance?.max_atol).toBe(0.003)
    // Leaderboard workload lists carry only axes plus latency bounds.
    const apiEntry = solWorkloadEntry.parse({
      axes: { batch_size: 8 },
      baseline_latency_ms: 0.05,
      sol_ms: 0.03,
    })
    expect(apiEntry.uuid).toBeUndefined()
    expect(apiEntry.sol_ms).toBe(0.03)
  })

  it("normalizes SOL timestamps to UTC instants", () => {
    expect(toUtcInstant("2026-08-14T05:38:44.902912")).toBe(
      "2026-08-14T05:38:44.902Z",
    )
    expect(toUtcInstant("2025-06-27T12:45:00Z")).toBe(
      "2025-06-27T12:45:00.000Z",
    )
  })

  it("imports a leaderboard submission as a suite-mean reported run", () => {
    const submission = parseSubmissions(read("api/submissions.json"), "fx")
      .values[0]
    const protocol = leaderboardProtocol("v1.1")
    const environment = leaderboardEnvironment("B200", "v1.1")
    const run = runFromSubmission({
      submission,
      implementationDigest: `sha256:${"1".repeat(64)}`,
      workloadDigest: `sha256:${"2".repeat(64)}`,
      protocol,
      protocolDigest: specDigest(protocol),
      environment,
      environmentDigest: specDigest(environment),
    })
    expect(run.manifest.spec.timing?.latencyNs.mean).toBe(
      Math.round((submission.latency_ms as number) * 1e6),
    )
    expect(run.manifest.spec.timing?.primaryStatistic).toBe("mean")
    expect(run.manifest.spec.sourceNative?.metrics?.sol_score).toBe(
      submission.sol_score,
    )
    expect(run.manifest.spec.sourceNative?.metrics?.latency_ms).toBe(
      submission.latency_ms,
    )
  })
})

const url = process.env.DATABASE_URL

describe.skipIf(!url)("sol import pipeline (database)", () => {
  class Rollback extends Error {}

  async function inRollback(
    fn: (
      tx: Parameters<Parameters<ReturnType<typeof db>["transaction"]>[0]>[0],
    ) => Promise<void>,
  ) {
    await db()
      .transaction(async (tx) => {
        await fn(tx)
        throw new Rollback("rollback")
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error
      })
  }

  it("imports the local fixture snapshot end to end, idempotently", async () => {
    process.env.SOL_EXAMPLES_COMMIT = EXAMPLES_COMMIT
    const data = discoverLocal(path.join(fixtures, "rmsnorm"))
    expect(data.issues).toHaveLength(0)
    expect(data.definitions.size).toBe(1)
    expect(data.traces).toHaveLength(2)
    expect(data.solutions).toHaveLength(1)

    await inRollback(async (tx) => {
      const { bundle, report } = await reconcile(tx, data, { topPerKernel: 3 })
      expect(report.issues).toHaveLength(0)
      // 4 workload cases; the two traces reuse existing case UUIDs.
      expect(bundle.workloads).toHaveLength(4)
      expect(bundle.operations).toHaveLength(1)
      expect(bundle.implementations).toHaveLength(1)
      expect(bundle.runs).toHaveLength(2)
      expect(bundle.implementations[0].manifest.spec.licensing.concluded).toBe(
        "Apache-2.0",
      )

      const first = await publishBundle(tx, bundle, { publish: true })
      expect(first.counts.operations.inserted).toBe(1)
      expect(first.counts.runs.inserted).toBe(2)

      const again = await publishBundle(tx, bundle, { publish: true })
      expect(again.counts.operations).toEqual({ inserted: 0, existing: 1 })
      expect(again.counts.runs).toEqual({ inserted: 0, existing: 2 })
      expect(again.counts.snapshots.inserted).toBe(0)

      const { report: second } = await reconcile(tx, data, { topPerKernel: 3 })
      expect(
        second.proposed.every((object) => object.action === "exists"),
      ).toBe(true)
    })
  })

  it("imports leaderboard submissions against the API workload suite", async () => {
    const detail = parseKernelDetail(read("api/kernel-4.json"), "fx")
    expect(detail.issues).toHaveLength(0)
    const definition = detail.values[0]
    const workloads = definition.workloads ?? []
    expect(workloads).toHaveLength(16)
    const submissions = parseSubmissions(
      read("api/submissions.json"),
      "fx",
    ).values
    // Synthetic negatives on top of real entries: skip logic must hold.
    const incorrect: SolSubmission = {
      ...submissions[0],
      id: 900001,
      is_correct: false,
    }
    const disqualified: SolSubmission = {
      ...submissions[0],
      id: 900002,
      is_disqualified: true,
    }
    // Faster than the published speed-of-light bound: review, not publish.
    const impossiblyFast: SolSubmission = {
      ...submissions[0],
      id: 900003,
      latency_ms: 1e-6,
    }

    const data: SolImportData = {
      definitions: new Map([[definition.name, definition]]),
      workloadEntries: new Map([[definition.name, workloads]]),
      submissions: new Map([
        [
          definition.name,
          [...submissions, incorrect, disqualified, impossiblyFast],
        ],
      ]),
      solutions: [],
      traces: [],
      snapshots: [],
      issues: [],
      driftWarnings: [],
    }

    await inRollback(async (tx) => {
      const { bundle, report } = await reconcile(tx, data, { topPerKernel: 2 })
      expect(report.selectedSubmissions).toBe(2)
      expect(report.skippedSubmissions.incorrect).toBeGreaterThanOrEqual(1)
      expect(report.skippedSubmissions.disqualified).toBeGreaterThanOrEqual(1)
      expect(report.licenseWarnings.length).toBeGreaterThanOrEqual(2)
      expect(
        report.ambiguities.some((entry) =>
          entry.includes("speed-of-light bound"),
        ),
      ).toBe(true)
      // Model provenance tags survive; subset markers (L1) do not.
      expect(bundle.operations[0].tags).toContain("model:lfm2-1-2b")
      expect(bundle.operations[0].tags).not.toContain("l1")
      // 16 cases plus the suite the runs bind to.
      expect(bundle.workloads).toHaveLength(17)
      expect(bundle.runs).toHaveLength(2)

      const result = await publishBundle(tx, bundle, { publish: true })
      expect(result.counts.runs.inserted).toBe(2)
      expect(result.counts.workloads.inserted).toBe(17)
    })
  })
})
