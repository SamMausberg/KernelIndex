import { describe, expect, it } from "vitest"
import type { WorkloadCaseManifest } from "../../schemas/kinds.ts"
import { estimateHeadroom } from "./headroom.ts"

const workloadCase = (
  axes: Record<string, number>,
  tensors: Record<string, { shape: number[]; dtype: string }>,
): WorkloadCaseManifest =>
  ({
    apiVersion: "kernelindex.dev/v1alpha1",
    kind: "WorkloadCase",
    metadata: { name: "case" },
    spec: {
      operationSpecDigest: `sha256:${"0".repeat(64)}`,
      axes,
      tensors,
      correctness: { comparator: "elementwise_close" },
    },
  }) as WorkloadCaseManifest

describe("headroom-v1", () => {
  it("puts a bf16 GEMM on the compute roofline with the formula stated", () => {
    const m = 4096
    const estimate = estimateHeadroom({
      family: "gemm",
      hardwareModel: "NVIDIA B200 SXM",
      workload: workloadCase(
        { m, n: m, k: m },
        {
          a: { shape: [m, m], dtype: "bf16" },
          b: { shape: [m, m], dtype: "bf16" },
          // The fp32 accumulator must not drop the floor to the tf32 peak.
          c: { shape: [m, m], dtype: "fp32" },
        },
      ),
      best: { value: 120_000, unit: "ns" },
    })
    expect(estimate).not.toBeNull()
    // (2×2 + 4) bytes × 4096² over 8 TB/s; 2·4096³ FLOPs at 2250 TFLOP/s.
    expect(estimate?.dramFloorNs).toBe(Math.round((8 * m * m) / 8000))
    expect(estimate?.computeFloorNs).toBe(Math.round((2 * m ** 3) / 2.25e6))
    expect(estimate?.floorNs).toBe(estimate?.computeFloorNs)
    expect(estimate?.ratio).toBeCloseTo(120_000 / (estimate?.floorNs ?? 1), 1)
    expect(estimate?.basis).toBe("estimate")
    expect(estimate?.computeDtype).toBe("bf16")
    expect(estimate?.assumptions[1]).toContain("2·M·N·K with M=4096")
  })

  it("gives memory-bound families a bandwidth floor only", () => {
    const estimate = estimateHeadroom({
      family: "rmsnorm",
      hardwareModel: "NVIDIA H100 80GB HBM3",
      workload: workloadCase(
        { tokens: 2048, hidden: 4096 },
        {
          input: { shape: [2048, 4096], dtype: "bf16" },
          output: { shape: [2048, 4096], dtype: "bf16" },
        },
      ),
      best: { value: 20_000, unit: "ns" },
    })
    expect(estimate?.hardware).toBe("H100 SXM")
    expect(estimate?.computeFloorNs).toBeNull()
    expect(estimate?.flops).toBeNull()
    expect(estimate?.dramFloorNs).toBe(Math.round((2 * 2048 * 4096 * 2) / 3350))
    expect(estimate?.assumptions.at(-1)).toContain("bandwidth floor only")
  })

  it("stays silent for unknown GPUs, suites, and non-latency metrics", () => {
    const workload = workloadCase(
      { m: 8 },
      { a: { shape: [8, 8], dtype: "fp32" } },
    )
    expect(
      estimateHeadroom({
        family: "gemm",
        hardwareModel: "NVIDIA RTX PRO 6000 Blackwell",
        workload,
        best: { value: 10, unit: "ns" },
      }),
    ).toBeNull()
    expect(
      estimateHeadroom({
        family: "gemm",
        hardwareModel: "NVIDIA B200",
        workload,
        best: { value: 10, unit: "tflops" },
      }),
    ).toBeNull()
  })
})
