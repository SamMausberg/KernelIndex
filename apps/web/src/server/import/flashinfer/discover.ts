// Discovery (§14.1): the dataset's pinned revision and file tree from the
// Hugging Face API, then each definition, baseline solution, and baseline
// trace file fetched at that immutable revision and snapshotted (§14.3).
// Baseline directories only — agent-generated traces stay out per policy.
import { type FetchedSnapshot, fetchSnapshot } from "../fetch.ts"
import { type ImportIssue, parseDefinition, parseTraces } from "../sol/parse.ts"
import type { SolDefinition, SolTrace } from "../sol/types.ts"
import {
  DATASET,
  DATASET_API,
  type FiSolution,
  fiDatasetInfo,
  fiSolution,
} from "./types.ts"

export type FiSolutionEntry = { solution: FiSolution; path: string }

export type FiImportData = {
  revision: string
  definitions: Map<string, SolDefinition>
  solutions: FiSolutionEntry[]
  traces: SolTrace[]
  snapshots: FetchedSnapshot[]
  issues: ImportIssue[]
  driftWarnings: string[]
}

export type FiDiscoverOptions = {
  /** Maximum definitions imported this run (§14.2 --limit). */
  limit?: number
}

const FETCH_SPACING_MS = 100
const pause = () =>
  new Promise((resolve) => setTimeout(resolve, FETCH_SPACING_MS))

const raw = (revision: string, path: string) =>
  `https://huggingface.co/datasets/${DATASET}/resolve/${revision}/${path}`

export async function discoverFlashinfer(
  options: FiDiscoverOptions,
): Promise<FiImportData> {
  const data: FiImportData = {
    revision: "",
    definitions: new Map(),
    solutions: [],
    traces: [],
    snapshots: [],
    issues: [],
    driftWarnings: [],
  }

  const listing = await fetchSnapshot(DATASET_API)
  data.snapshots.push(listing)
  const info = fiDatasetInfo.safeParse(JSON.parse(listing.body))
  if (!info.success) {
    data.issues.push({
      locator: listing.locator,
      item: "dataset",
      problem: `unparseable dataset listing: ${info.error.message}`,
    })
    return data
  }
  data.revision = info.data.sha
  const files = info.data.siblings.map((sibling) => sibling.rfilename)

  let definitionFiles = files.filter(
    (file) => file.startsWith("definitions/") && file.endsWith(".json"),
  )
  if (options.limit !== undefined)
    definitionFiles = definitionFiles.slice(0, options.limit)
  const wanted = new Set(
    definitionFiles.map((file) => file.split("/").at(-1)?.replace(".json", "")),
  )

  for (const file of definitionFiles) {
    const snapshot = await fetchSnapshot(raw(data.revision, file))
    data.snapshots.push(snapshot)
    const outcome = parseDefinition(snapshot.body, snapshot.locator)
    data.issues.push(...outcome.issues)
    data.driftWarnings.push(...outcome.driftWarnings)
    for (const definition of outcome.values)
      data.definitions.set(definition.name, definition)
    await pause()
  }

  for (const file of files) {
    if (!file.startsWith("solutions/baseline/") || !file.endsWith(".json"))
      continue
    const definitionName = file.split("/").at(-2)
    if (!wanted.has(definitionName)) continue
    const snapshot = await fetchSnapshot(raw(data.revision, file))
    data.snapshots.push(snapshot)
    const parsed = fiSolution.safeParse(JSON.parse(snapshot.body))
    if (!parsed.success) {
      data.issues.push({
        locator: snapshot.locator,
        item: file,
        problem: parsed.error.issues
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; "),
      })
      continue
    }
    data.solutions.push({ solution: parsed.data, path: file })
    await pause()
  }

  for (const file of files) {
    if (!file.startsWith("traces/baseline/") || !file.endsWith(".jsonl"))
      continue
    const definitionName = file.split("/").at(-1)?.replace(".jsonl", "")
    if (!wanted.has(definitionName)) continue
    try {
      const snapshot = await fetchSnapshot(raw(data.revision, file))
      data.snapshots.push(snapshot)
      const outcome = parseTraces(snapshot.body, snapshot.locator)
      data.issues.push(...outcome.issues)
      data.driftWarnings.push(...outcome.driftWarnings)
      data.traces.push(...outcome.values)
    } catch (error) {
      // Large LFS-tracked files redirect to hosts outside the fetch
      // allowlist; the file is skipped with a review issue, never guessed.
      data.issues.push({
        locator: raw(data.revision, file),
        item: file,
        problem: `trace fetch failed: ${(error as Error).message}`,
      })
    }
    await pause()
  }

  data.driftWarnings = [...new Set(data.driftWarnings)]
  return data
}
