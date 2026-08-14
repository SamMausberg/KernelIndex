// Discovery (§14.1): enumerate what to import. Leaderboard mode walks the
// public SOL-ExecBench API plus the Hugging Face dataset rows; snapshot mode
// walks a local directory produced by sol-execbench or a saved fetch.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { sha256Digest } from "../../identity/digest.ts"
import { type FetchedSnapshot, fetchSnapshot } from "./fetch.ts"
import {
  type ImportIssue,
  parseDefinition,
  parseKernelList,
  parseSolution,
  parseSubmissions,
  parseTraces,
  parseWorkloadJsonl,
} from "./parse.ts"
import {
  LEADERBOARD_BASE,
  type SolDefinition,
  type SolSolution,
  type SolSubmission,
  type SolTrace,
  type SolWorkloadEntry,
  solDefinition,
  solWorkloadEntry,
} from "./types.ts"

/**
 * Reviewed default kernel set for the first corpus, following the §22.14
 * operation order: norms first, then attention, GEMM-adjacent projections,
 * activations, and quantized variants.
 */
export const DEFAULT_KERNELS = [
  "002_fused_add_rmsnorm_h4096",
  "001_fused_add_rmsnorm_h2048",
  "003_fused_add_rmsnorm_h7168",
  "013_gqa_paged_decode_h32_kv8_d128_ps1",
  "001_fp8_attention_output_projection",
  "002_fp8_attention_qkv_projection",
  "003_fp8_mlp_gate_up_projection",
  "004_attention_output_projection_with_reshape_backward",
]

export type SolSolutionEntry = {
  solution: SolSolution
  definitionName: string
  repository: string
  commit: string
  examplePath: string
}

/** Everything one import invocation discovered, parsed, and snapshotted. */
export type SolImportData = {
  definitions: Map<string, SolDefinition>
  workloadEntries: Map<string, SolWorkloadEntry[]>
  submissions: Map<string, SolSubmission[]>
  solutions: SolSolutionEntry[]
  traces: SolTrace[]
  snapshots: FetchedSnapshot[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

function emptyData(): SolImportData {
  return {
    definitions: new Map(),
    workloadEntries: new Map(),
    submissions: new Map(),
    solutions: [],
    traces: [],
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }
}

const SUBSETS = ["L1", "L2", "Quant", "FlashInfer-Bench"]
const DATASET_ROWS_BASE =
  "https://datasets-server.huggingface.co/rows?dataset=nvidia%2FSOL-ExecBench&split=train"

type DatasetRow = Record<string, unknown>

/** Page one dataset subset and return raw rows for the wanted definitions. */
async function datasetRows(
  subset: string,
  wanted: Set<string>,
  data: SolImportData,
): Promise<Map<string, DatasetRow>> {
  const found = new Map<string, DatasetRow>()
  for (let offset = 0; ; offset += 100) {
    const locator = `${DATASET_ROWS_BASE}&config=${encodeURIComponent(subset)}&offset=${offset}&length=100`
    const snapshot = await fetchSnapshot(locator)
    data.snapshots.push(snapshot)
    const page = JSON.parse(snapshot.body) as { rows?: { row: DatasetRow }[] }
    const rows = page.rows ?? []
    for (const { row } of rows) {
      const name = row.name
      if (typeof name === "string" && wanted.has(name)) found.set(name, row)
    }
    if (rows.length < 100 || found.size === wanted.size) return found
  }
}

/** Dataset rows store nested objects as JSON strings; unfold them. */
function definitionFromRow(
  row: DatasetRow,
  locator: string,
  data: SolImportData,
): void {
  try {
    const document = {
      ...row,
      axes: JSON.parse(row.axes as string),
      inputs: JSON.parse(row.inputs as string),
      outputs: JSON.parse(row.outputs as string),
    }
    const definition = solDefinition.parse(document)
    data.definitions.set(definition.name, definition)
    const workloads = (JSON.parse(row.workloads as string) as unknown[]).map(
      (entry) => solWorkloadEntry.parse(entry),
    )
    data.workloadEntries.set(definition.name, workloads)
  } catch (error) {
    data.issues.push({
      locator,
      item: String(row.name ?? "unknown row"),
      problem: (error as Error).message,
    })
  }
}

export type LeaderboardOptions = {
  kernels: string[]
  limit?: number
  resume?: string
}

/** Leaderboard mode: definitions, workload suites, and submissions. */
export async function discoverLeaderboard(
  options: LeaderboardOptions,
): Promise<SolImportData> {
  const data = emptyData()

  const listSnapshot = await fetchSnapshot(`${LEADERBOARD_BASE}/kernels`)
  data.snapshots.push(listSnapshot)
  const kernelList = parseKernelList(listSnapshot.body, listSnapshot.locator)
  data.issues.push(...kernelList.issues)
  data.driftWarnings.push(...kernelList.driftWarnings)

  let wanted = kernelList.values.filter((kernel) =>
    options.kernels.includes(kernel.name),
  )
  if (options.resume) {
    const resumeIndex = wanted.findIndex(
      (kernel) => kernel.name === options.resume,
    )
    if (resumeIndex >= 0) wanted = wanted.slice(resumeIndex)
  }
  if (options.limit !== undefined) wanted = wanted.slice(0, options.limit)
  for (const requested of options.kernels) {
    if (
      !kernelList.values.some((kernel) => kernel.name === requested) &&
      options.resume === undefined
    ) {
      data.issues.push({
        locator: listSnapshot.locator,
        item: requested,
        problem: "requested kernel not present in the leaderboard kernel list",
      })
    }
  }

  // Definitions and workload suites from the Hugging Face dataset.
  const bySubset = new Map<string, Set<string>>()
  for (const kernel of wanted) {
    const subset = (kernel.tags ?? []).find((tag) => SUBSETS.includes(tag))
    if (!subset) {
      data.issues.push({
        locator: listSnapshot.locator,
        item: kernel.name,
        problem: "kernel has no dataset subset tag; definition source unknown",
      })
      continue
    }
    bySubset.set(subset, (bySubset.get(subset) ?? new Set()).add(kernel.name))
  }
  for (const [subset, names] of bySubset) {
    const rows = await datasetRows(subset, names, data)
    for (const name of names) {
      const row = rows.get(name)
      if (!row) {
        data.issues.push({
          locator: `${DATASET_ROWS_BASE}&config=${subset}`,
          item: name,
          problem: "definition not found in dataset subset",
        })
        continue
      }
      definitionFromRow(row, `${DATASET_ROWS_BASE}&config=${subset}`, data)
    }
  }

  // Published evaluation results per kernel.
  for (const kernel of wanted) {
    if (!data.definitions.has(kernel.name)) continue
    const snapshot = await fetchSnapshot(
      `${LEADERBOARD_BASE}/submissions?kernel_id=${kernel.id}`,
    )
    data.snapshots.push(snapshot)
    const submissions = parseSubmissions(snapshot.body, snapshot.locator)
    data.issues.push(...submissions.issues)
    data.driftWarnings.push(...submissions.driftWarnings)
    data.submissions.set(kernel.name, submissions.values)
  }

  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}

/** Snapshot mode: walk a local directory of SOL files (§14.2 --snapshot). */
export function discoverLocal(root: string): SolImportData {
  const data = emptyData()
  const entries = readdirSync(root, { recursive: true }) as string[]

  const record = (relative: string, body: string) => {
    const filePath = path.join(root, relative)
    data.snapshots.push({
      locator: `file://${filePath}`,
      resolvedLocator: `file://${filePath}`,
      contentDigest: sha256Digest(body),
      mediaType: relative.endsWith(".jsonl")
        ? "application/jsonl"
        : "application/json",
      sizeBytes: Buffer.byteLength(body),
      body,
      fetchedAt: statSync(filePath).mtime,
    })
    return `file://${filePath}`
  }

  for (const relative of entries) {
    const filePath = path.join(root, relative)
    if (!statSync(filePath).isFile()) continue
    const base = path.basename(relative)
    const body = () => readFileSync(filePath, "utf8")

    if (base === "definition.json") {
      const text = body()
      const outcome = parseDefinition(text, record(relative, text))
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
      for (const definition of outcome.values)
        data.definitions.set(definition.name, definition)
    } else if (base === "workload.jsonl") {
      const text = body()
      const outcome = parseWorkloadJsonl(text, record(relative, text))
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
      // Attached to the definition in the same directory at reconcile time.
      const definitionName = path.basename(path.dirname(filePath))
      data.workloadEntries.set(definitionName, outcome.values)
    } else if (base.startsWith("solution") && base.endsWith(".json")) {
      const text = body()
      const outcome = parseSolution(text, record(relative, text))
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
      for (const solution of outcome.values) {
        data.solutions.push({
          solution,
          definitionName: solution.definition,
          repository: "https://github.com/nvidia/sol-execbench",
          commit: process.env.SOL_EXAMPLES_COMMIT ?? "",
          examplePath: path.dirname(relative),
        })
      }
    } else if (
      base.includes("trace") &&
      (base.endsWith(".json") || base.endsWith(".jsonl"))
    ) {
      const text = body()
      const outcome = parseTraces(text, record(relative, text))
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
      data.traces.push(...outcome.values)
    }
  }

  // Workload lists keyed by a directory name that is not a known definition
  // are re-keyed when exactly one definition was discovered next to them.
  for (const [key, entries] of [...data.workloadEntries]) {
    if (!data.definitions.has(key) && data.definitions.size === 1) {
      const [onlyName] = data.definitions.keys()
      data.workloadEntries.delete(key)
      data.workloadEntries.set(onlyName, entries)
    }
  }

  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
