// headroom-v1 (§11.9): a deliberately coarse roofline for one measured
// cohort. Bytes come from the workload's declared tensors, FLOPs from a
// per-family formula where one exists, peaks from the datasheet table. The
// result is an estimate of a lower bound, never evidence: `basis` travels
// with every value so no surface can present it as a measurement.
import type { HeadroomEstimate } from "../../lib/catalog-models.ts"
import type { AnyWorkloadManifest } from "../catalog/present.ts"
import { hardwareSpec } from "./hardware-specs.ts"

export const HEADROOM_POLICY_VERSION = "headroom-v1"

const DTYPE_BYTES: Record<string, number> = {
  fp64: 8,
  int64: 8,
  fp32: 4,
  tf32: 4,
  int32: 4,
  bf16: 2,
  fp16: 2,
  int16: 2,
  fp8: 1,
  e4m3: 1,
  e5m2: 1,
  fp8_e4m3: 1,
  fp8_e4m3fnuz: 1,
  fp8_e5m2: 1,
  int8: 1,
  uint8: 1,
  fp4: 0.5,
  nvfp4: 0.5,
  mxfp4: 0.5,
  int4: 0.5,
}

/** Tensor-core dtype class the workload's widest input dtype maps to. */
function computeClass(
  dtype: string,
): "fp4" | "fp8" | "bf16" | "tf32" | "fp32" | null {
  if (dtype.startsWith("fp4") || dtype.endsWith("fp4")) return "fp4"
  if (
    dtype.startsWith("fp8") ||
    dtype.startsWith("e4m3") ||
    dtype.startsWith("e5m2")
  )
    return "fp8"
  if (dtype === "bf16" || dtype === "fp16") return "bf16"
  // fp32 inputs take the TF32 path on every listed GPU: the faster peak
  // keeps the floor a lower bound.
  if (dtype === "fp32" || dtype === "tf32") return "tf32"
  return null
}

const GEMM_FAMILIES = new Set([
  "gemm",
  "gemv",
  "linear",
  "matmul",
  "batched-gemm",
])
const ATTENTION_FAMILIES = new Set([
  "attention",
  "mla-attention",
  "flash-attention",
  "gqa-attention",
  "paged-attention",
  "multi-token-attention",
  "neighborhood-attention",
])

const axisOf = (axes: Record<string, number>, ...names: string[]) => {
  for (const name of names) {
    const hit = Object.entries(axes).find(
      ([axis]) => axis.toLowerCase() === name,
    )
    if (hit && hit[1] > 0) return hit[1]
  }
  return null
}

/** FLOPs for families with a closed form; null elsewhere (memory-bound
 * families deliberately get no compute floor). */
function familyFlops(
  family: string,
  axes: Record<string, number>,
  tensors: { shape: number[] }[],
): { flops: number; note: string } | null {
  if (GEMM_FAMILIES.has(family)) {
    let m = axisOf(axes, "m")
    let n = axisOf(axes, "n")
    let k = axisOf(axes, "k")
    const batch = axisOf(axes, "batch", "b") ?? 1
    if ((m === null || n === null || k === null) && tensors.length >= 2) {
      // A [M,K] · B [K,N] or [N,K]: the shared dimension is K.
      const a = tensors[0].shape.slice(-2)
      const b = tensors[1].shape.slice(-2)
      if (a.length === 2 && b.length === 2) {
        m = a[0]
        k = a[1]
        n = b[0] === k ? b[1] : b[0]
      }
    }
    if (m === null || n === null || k === null) return null
    return {
      flops: 2 * batch * m * n * k,
      note: `2·M·N·K with M=${m}, N=${n}, K=${k}`,
    }
  }
  if (ATTENTION_FAMILIES.has(family)) {
    const batch = axisOf(axes, "batch", "b", "batch_size") ?? 1
    const heads = axisOf(
      axes,
      "heads",
      "h",
      "num_heads",
      "num_qo_heads",
      "q_heads",
    )
    const q = axisOf(
      axes,
      "seq",
      "seqlen",
      "seq_len",
      "q_len",
      "qo_len",
      "tokens",
      "num_tokens",
    )
    const kv =
      axisOf(
        axes,
        "kv_len",
        "kv_seqlen",
        "kv_seq_len",
        "context",
        "context_len",
      ) ?? q
    const d = axisOf(axes, "head_dim", "d", "dim", "head_size")
    if (heads === null || q === null || kv === null || d === null) return null
    return {
      flops: 4 * batch * heads * q * kv * d,
      note: `4·B·H·Lq·Lk·D with B=${batch}, H=${heads}, Lq=${q}, Lk=${kv}, D=${d}`,
    }
  }
  return null
}

/**
 * Estimate the roofline floor under a cohort's record. Null when the GPU is
 * not in the datasheet table, the workload is a suite, or the metric is not
 * latency in nanoseconds.
 */
export function estimateHeadroom(input: {
  family: string
  hardwareModel: string
  workload: AnyWorkloadManifest
  best: { value: number; unit: string } | null
}): HeadroomEstimate | null {
  const { workload, best } = input
  if (!best || best.unit !== "ns" || workload.kind !== "WorkloadCase")
    return null
  const spec = hardwareSpec(input.hardwareModel)
  if (spec === null) return null
  const tensors = Object.values(workload.spec.tensors)
  let bytes = 0
  const classes = new Set<NonNullable<ReturnType<typeof computeClass>>>()
  for (const tensor of tensors) {
    const width = DTYPE_BYTES[tensor.dtype]
    if (width === undefined) continue
    bytes += width * tensor.shape.reduce((product, dim) => product * dim, 1)
    const cls = computeClass(tensor.dtype)
    if (cls !== null) classes.add(cls)
  }
  if (bytes === 0) return null
  const dramFloorNs = bytes / spec.dramGBs
  const assumptions = [
    `every declared tensor crosses HBM exactly once (${spec.dramGBs.toLocaleString("en-US")} GB/s, ${spec.label} datasheet)`,
  ]
  const formula = familyFlops(input.family, workload.spec.axes, tensors)
  // The fastest peak any declared dtype could run at keeps the floor a
  // lower bound: a bf16 GEMM with an fp32 accumulator tensor must not be
  // floored at the tf32 peak.
  const dtypeClass = [...classes].reduce<ReturnType<typeof computeClass>>(
    (best, cls) =>
      best === null || (spec.tflops[cls] ?? 0) > (spec.tflops[best] ?? 0)
        ? cls
        : best,
    null,
  )
  const peak = dtypeClass ? spec.tflops[dtypeClass] : undefined
  let computeFloorNs: number | null = null
  if (formula && peak !== undefined && dtypeClass) {
    computeFloorNs = formula.flops / (peak * 1e3)
    assumptions.push(
      `${formula.note} at the dense ${dtypeClass} peak (${peak.toLocaleString("en-US")} TFLOP/s)`,
    )
  } else if (formula === null) {
    assumptions.push(
      "no arithmetic formula for this family: bandwidth floor only",
    )
  }
  const floorNs = Math.max(dramFloorNs, computeFloorNs ?? 0)
  return {
    basis: "estimate",
    policyVersion: HEADROOM_POLICY_VERSION,
    hardware: spec.label,
    bytes,
    flops: formula?.flops ?? null,
    computeDtype: dtypeClass,
    dramFloorNs: Math.round(dramFloorNs),
    computeFloorNs: computeFloorNs === null ? null : Math.round(computeFloorNs),
    floorNs: Math.round(floorNs),
    bestNs: best.value,
    ratio: Math.round((best.value / floorNs) * 100) / 100,
    assumptions,
  }
}
