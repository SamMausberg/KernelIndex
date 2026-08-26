// Upstream KernelBench shapes: the committed baseline timing JSONs under
// results/timing/<machine>/ in ScalingIntelligence/KernelBench and the
// problem modules under KernelBench/level{1,2,3}/, pinned to one commit.
// MIT — see docs/source-policy.md.
import { z } from "zod"

export const KB_REPO = "ScalingIntelligence/KernelBench"
export const KB_REPO_URL = `https://github.com/${KB_REPO}`
export const TIMING_PATH = "results/timing"
export const PROBLEMS_PATH = "KernelBench"

export const KB_SOURCE = {
  slug: "kernelbench",
  kind: "benchmark",
  name: "KernelBench baseline timings",
  policy: {
    license: "MIT",
    // MIT's one condition is that copies carry the copyright and permission
    // notice; the attribution line renders beside every mirrored module.
    attribution:
      "KernelBench, © 2023 Anne Ouyang, Simon Guo, Azalia Mirhoseini (Scaling Intelligence Lab, Stanford University), MIT License",
    url: KB_REPO_URL,
    terms:
      "MIT: use, copy, modify, and distribute permitted provided the copyright and permission notice accompany copies.",
    verified: "2026-08-26",
    freshnessDays: 180,
  },
} as const

export const PARSER = { name: "kernelbench", version: "1" } as const

/** Timing hosts: one environment each, named for the provider that ran it.
 * The GPU string itself comes from the JSON's `hardware` field. */
export const MACHINES: Record<string, { host: string }> = {
  H100_Modal: { host: "Modal" },
  H100_PCIe_LambdaLabs: { host: "Lambda Labs" },
}

/** Baseline execution modes: the timing file → the PyTorch path it timed. */
export const MODES: Record<
  string,
  {
    key: string
    /** Digest-bearing callable interface: the mode is part of identity. */
    interface: string
    title: string
    description: string
    baseline: boolean
  }
> = {
  "baseline_time_torch.json": {
    key: "torch",
    interface: "torch_eager",
    title: "PyTorch eager",
    description:
      "The KernelBench reference module run as written, in PyTorch eager mode.",
    baseline: true,
  },
  "baseline_time_torch_compile_inductor_default.json": {
    key: "torch-compile-inductor",
    interface: "torch_compile_inductor",
    title: "torch.compile (inductor)",
    description:
      "The KernelBench reference module compiled with torch.compile, inductor backend, default mode.",
    baseline: false,
  },
}

export const LEVELS = ["level1", "level2", "level3"] as const
export type Level = (typeof LEVELS)[number]

/** One problem's stats inside a timing file (milliseconds, `num_trials`
 * timed runs after warm-up). */
export const timingEntry = z.object({
  mean: z.number().positive(),
  std: z.number().nonnegative(),
  min: z.number().positive(),
  max: z.number().positive(),
  num_trials: z.int().positive(),
  hardware: z.string().min(1),
})
export type TimingEntry = z.output<typeof timingEntry>

export const timingFile = z.partialRecord(
  z.enum(LEVELS),
  z.record(z.string().endsWith(".py"), timingEntry),
)
export type TimingFile = z.output<typeof timingFile>

/** One timed (machine, mode, problem) triple. */
export type KbTiming = {
  machine: string
  mode: string
  level: Level
  file: string
  entry: TimingEntry
}
