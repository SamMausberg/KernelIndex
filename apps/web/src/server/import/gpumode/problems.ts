// Curated KernelBot problem specifications (§22.14 curation): tensor
// arguments and axes hand-transcribed from each problem's task.yml in
// gpu-mode/reference-kernels, reviewed against the reference implementation.
// Only reviewed problems import; unreviewed leaderboards are skipped with an
// issue, never guessed. `amd-identity` is deliberately absent — its task.yml
// marks it a submission-system test with no points. The amd_distributed
// multi-GPU boards are deliberately not curated.
//
// Entries live in problems/<competition>.ts so review stays per-competition;
// this module owns the shared types and the merged registry.
import { AMD_PROBLEMS } from "./problems/amd.ts"
import { AMD_1_1M_PROBLEMS } from "./problems/amd-1-1m.ts"
import { HELION_PROBLEMS } from "./problems/helion.ts"
import { LINALG_PROBLEMS } from "./problems/linalg.ts"
import { NVIDIA_PROBLEMS } from "./problems/nvidia.ts"
import { PMPP_PROBLEMS } from "./problems/pmpp.ts"
import { TRIMUL_PROBLEMS } from "./problems/trimul.ts"

export type CuratedArgument = {
  name: string
  shape: (string | number)[]
  dtype: string
  layout?: "row_major" | "col_major"
}

/** datasets-server configs of GPUMODE/kernelbot-data the importer reads. */
export type KernelbotConfig =
  | "amd_successful_submissions"
  | "amd_1_1m_competition"
  | "nvidia_nvfp4_submissions"
  | "pmpp_v2_submissions"
  | "linalg_submissions"
  | "trimul_submissions"
  | "helion_b200_nebius"

export type CuratedProblem = {
  /** Leaderboard name on gpumode.com; must equal the dataset's problem
      identity (`problem_name` for flat configs, leaderboards row for
      per-shape). */
  leaderboard: string
  slug: string
  title: string
  family: string
  description: string
  /** task.yml path in gpu-mode/reference-kernels (definition provenance). */
  taskPath: string
  axes: Record<
    string,
    | { role: "variable" }
    | { role: "constant"; value: number }
    | { role: "derived"; expression: string }
  >
  inputs: CuratedArgument[]
  outputs: CuratedArgument[]
  tags: string[]
  /** datasets-server config this board's rows live in. */
  config: KernelbotConfig
  /** per-shape rows (run_result map) vs one aggregate score per submission. */
  scoring: "per-shape" | "aggregate"
  /** Aggregate boards: the published case list and ranking statistic from
      task.yml (`ranking_by`); the leaderboard score aggregates these cases. */
  suite?: {
    statistic: string
    cases: { externalId: string; axes: Record<string, number> }[]
  }
  /** Known runner labels, from task.yml/competition docs. Discovery unions
      these with runners observed in the ranked slice; never a guess. */
  gpus?: string[]
}

export const CURATED_PROBLEMS: CuratedProblem[] = [
  ...AMD_PROBLEMS,
  ...AMD_1_1M_PROBLEMS,
  ...NVIDIA_PROBLEMS,
  ...PMPP_PROBLEMS,
  ...LINALG_PROBLEMS,
  ...TRIMUL_PROBLEMS,
  ...HELION_PROBLEMS,
]

// Slugs and leaderboard names are global identity; fail fast on a collision.
{
  const seen = new Set<string>()
  for (const problem of CURATED_PROBLEMS) {
    for (const key of [problem.slug, problem.leaderboard]) {
      if (seen.has(key)) throw new Error(`duplicate curated problem: ${key}`)
      seen.add(key)
    }
  }
}
