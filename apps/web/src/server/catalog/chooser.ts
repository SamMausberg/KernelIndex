// Chooser annotations (§16.6): when a multi-match query carries environment
// or dtype facets, each candidate operation states how much evidence it has
// under them. Matching mirrors intentMismatches (match.ts) for the facet
// subset the scalar read columns can verify — gpu, architecture, CUDA major,
// workload dtypes. Shape and axis facets bind exact cases inside one
// operation and stay out of chooser counts.
import type { ChooserMatch } from "../../lib/catalog-models.ts"
import type { SearchIntent } from "../../lib/search-query.ts"

export type ChooserFacets = Pick<
  SearchIntent,
  "gpu" | "architecture" | "cudaMajor" | "dtypes"
> & { label: string }

/** Null when the query carries no verifiable facet: chooser stays plain. */
export function chooserFacets(intent: SearchIntent): ChooserFacets | null {
  const { gpu, architecture, cudaMajor, dtypes } = intent
  if (
    gpu === null &&
    architecture === null &&
    cudaMajor === null &&
    dtypes.length === 0
  )
    return null
  const label = [
    gpu ?? architecture,
    cudaMajor !== null ? `CUDA ${cudaMajor}` : null,
    ...dtypes,
  ]
    .filter((part): part is string => part !== null)
    .join(" · ")
  return { gpu, architecture, cudaMajor, dtypes, label }
}

export type ChooserRun = {
  hardwareModel: string
  hardwareArchitecture: string
  cudaMajor: number | null
  workloadDtypes: string[]
  sourceAvailable: boolean
  primaryValue: number | null
  primaryUnit: string | null
}

export function runMatchesFacets(
  run: ChooserRun,
  facets: ChooserFacets,
): boolean {
  if (
    facets.gpu !== null &&
    !run.hardwareModel.toLowerCase().includes(facets.gpu.toLowerCase())
  )
    return false
  if (
    facets.architecture !== null &&
    facets.architecture !== run.hardwareArchitecture
  )
    return false
  if (facets.cudaMajor !== null && facets.cudaMajor !== run.cudaMajor)
    return false
  return facets.dtypes.every((dtype) => run.workloadDtypes.includes(dtype))
}

/** Fold one operation's eligible run scalars into its chooser annotation. */
export function chooserMatch(
  runs: ChooserRun[],
  facets: ChooserFacets,
): ChooserMatch {
  let matching = 0
  let withSource = 0
  let best: ChooserMatch["best"] = null
  for (const run of runs) {
    if (!runMatchesFacets(run, facets)) continue
    matching++
    if (run.sourceAvailable) withSource++
    if (
      run.primaryValue !== null &&
      run.primaryUnit !== null &&
      (best === null || run.primaryValue < best.value)
    )
      best = { value: run.primaryValue, unit: run.primaryUnit }
  }
  return { matching, withSource, best, facetLabel: facets.label }
}

/**
 * Stable partition: operations with matching evidence first, resolver order
 * untouched inside each partition — textual resolution never regresses, the
 * user just stops being sent to operations with nothing for them.
 */
export function rankChooserMatches<T extends { match?: ChooserMatch | null }>(
  entries: T[],
): T[] {
  const has = (entry: T) => (entry.match?.matching ?? 0) > 0
  return [...entries.filter(has), ...entries.filter((entry) => !has(entry))]
}
