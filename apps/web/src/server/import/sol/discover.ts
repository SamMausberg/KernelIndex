// Discovery (§14.1): enumerate what to import. Leaderboard mode walks only
// the public SOL-ExecBench leaderboard API — never the Hugging Face dataset,
// whose NVIDIA Evaluation Dataset License forbids redistribution (see
// docs/source-policy.md). Snapshot mode walks a local directory produced by
// sol-execbench or a saved fetch.
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { sha256Digest } from "../../identity/digest.ts"
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import {
  type ImportIssue,
  parseDefinition,
  parseKernelDetail,
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
} from "./types.ts"

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
  /** Leaderboard mode: the first kernel `--limit` left unwalked, so a
   * windowed run knows where to resume. Undefined once the walk is done. */
  nextResume?: string
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

export type LeaderboardOptions = {
  /** Explicit kernel names; absent means every kernel on the leaderboard. */
  kernels?: string[]
  /** Tranche filter: keep kernels carrying this leaderboard tag. */
  tag?: string
  limit?: number
  resume?: string
}

/** Politeness delay between per-kernel API fetches (ToS §3.2(g)). */
const FETCH_SPACING_MS = 120
/** The submissions endpoint's maximum page; larger asks are clamped to it. */
const SUBMISSION_PAGE = 50

/** Leaderboard mode: definitions, workload lists, and submissions. */
export async function discoverLeaderboard(
  options: LeaderboardOptions,
): Promise<SolImportData> {
  const data = emptyData()

  const listSnapshot = await fetchSnapshot(`${LEADERBOARD_BASE}/kernels`)
  data.snapshots.push(listSnapshot)
  const kernelList = parseKernelList(listSnapshot.body, listSnapshot.locator)
  data.issues.push(...kernelList.issues)
  data.driftWarnings.push(...kernelList.driftWarnings)

  let wanted = kernelList.values
  if (options.kernels !== undefined) {
    const requestedNames = options.kernels
    wanted = wanted.filter((kernel) => requestedNames.includes(kernel.name))
    if (options.resume === undefined) {
      for (const requested of requestedNames) {
        if (!kernelList.values.some((kernel) => kernel.name === requested)) {
          data.issues.push({
            locator: listSnapshot.locator,
            item: requested,
            problem:
              "requested kernel not present in the leaderboard kernel list",
          })
        }
      }
    }
  }
  if (options.tag !== undefined) {
    const tag = options.tag
    wanted = wanted.filter((kernel) => (kernel.tags ?? []).includes(tag))
  }
  if (options.resume) {
    const resumeIndex = wanted.findIndex(
      (kernel) => kernel.name === options.resume,
    )
    if (resumeIndex >= 0) wanted = wanted.slice(resumeIndex)
  }
  if (options.limit !== undefined) {
    data.nextResume = wanted[options.limit]?.name
    wanted = wanted.slice(0, options.limit)
  }

  // Definitions plus workload lists from the public kernel-detail endpoint,
  // then the published evaluation results per kernel.
  for (const kernel of wanted) {
    const detailSnapshot = await fetchSnapshot(
      `${LEADERBOARD_BASE}/kernels/${kernel.id}`,
    )
    data.snapshots.push(detailSnapshot)
    const detail = parseKernelDetail(
      detailSnapshot.body,
      detailSnapshot.locator,
    )
    data.issues.push(...detail.issues)
    data.driftWarnings.push(...detail.driftWarnings)
    const definition = detail.values[0]
    if (!definition) continue
    definition.tags = definition.tags ?? kernel.tags ?? []
    data.definitions.set(definition.name, definition)
    data.workloadEntries.set(definition.name, definition.workloads ?? [])

    // The endpoint pages: without an explicit limit it answers with the
    // newest 20 of a kernel's submissions, and it caps a page at
    // SUBMISSION_PAGE. Walk it until it runs out, so selection sees every
    // submitter the leaderboard exposes rather than the last handful.
    const submissions: SolSubmission[] = []
    for (let offset = 0; ; offset += SUBMISSION_PAGE) {
      const snapshot = await fetchSnapshot(
        `${LEADERBOARD_BASE}/submissions?kernel_id=${kernel.id}&limit=${SUBMISSION_PAGE}&offset=${offset}`,
      )
      data.snapshots.push(snapshot)
      const page = parseSubmissions(snapshot.body, snapshot.locator)
      data.issues.push(...page.issues)
      data.driftWarnings.push(...page.driftWarnings)
      submissions.push(...page.values)
      await new Promise((resolve) => setTimeout(resolve, FETCH_SPACING_MS))
      if (page.values.length < SUBMISSION_PAGE) break
    }
    data.submissions.set(definition.name, submissions)
  }

  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}

/** Snapshot mode: walk a local directory of SOL files (§14.2 --snapshot). */
export function discoverLocal(
  root: string,
  examplesCommit?: string,
): SolImportData {
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
          commit: examplesCommit ?? "",
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
