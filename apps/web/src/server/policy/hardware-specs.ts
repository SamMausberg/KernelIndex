// Vendor datasheet peaks behind the headroom estimate (§11.9). Dense
// tensor-core throughput in TFLOP/s (never the sparsity-doubled figure) and
// HBM/GDDR bandwidth in GB/s, matched by product substring. A GPU missing
// here simply gets no estimate; nothing is interpolated.
export type HardwareSpec = {
  /** Substring of benchmark_runs.hardware_model, lowercase, first match wins. */
  match: string
  label: string
  dramGBs: number
  /** Dense peak by compute dtype; absent dtypes have no tensor-core path. */
  tflops: Partial<Record<"fp4" | "fp8" | "bf16" | "tf32" | "fp32", number>>
}

export const HARDWARE_SPECS: HardwareSpec[] = [
  // NVIDIA Blackwell: B200/GB200 datasheet (HBM3e 8 TB/s; FP16 2.25 PF dense).
  {
    match: "b300",
    label: "B300",
    dramGBs: 8000,
    tflops: { fp4: 15000, fp8: 4500, bf16: 2250, tf32: 1100, fp32: 75 },
  },
  {
    match: "gb200",
    label: "GB200",
    dramGBs: 8000,
    tflops: { fp4: 9000, fp8: 4500, bf16: 2250, tf32: 1100, fp32: 80 },
  },
  {
    match: "b200",
    label: "B200",
    dramGBs: 8000,
    tflops: { fp4: 9000, fp8: 4500, bf16: 2250, tf32: 1100, fp32: 80 },
  },
  // NVIDIA Hopper: H100 SXM5 / PCIe, H200, H20 datasheets.
  {
    match: "h100 pcie",
    label: "H100 PCIe",
    dramGBs: 2000,
    tflops: { fp8: 1513, bf16: 756, tf32: 378, fp32: 51 },
  },
  {
    match: "h200",
    label: "H200",
    dramGBs: 4800,
    tflops: { fp8: 1979, bf16: 989, tf32: 495, fp32: 67 },
  },
  {
    match: "h100",
    label: "H100 SXM",
    dramGBs: 3350,
    tflops: { fp8: 1979, bf16: 989, tf32: 495, fp32: 67 },
  },
  {
    match: "h20",
    label: "H20",
    dramGBs: 4000,
    tflops: { fp8: 296, bf16: 148, tf32: 74, fp32: 44 },
  },
  // NVIDIA Ampere / Ada / Turing.
  {
    match: "a100",
    label: "A100 80GB",
    dramGBs: 2039,
    tflops: { bf16: 312, tf32: 156, fp32: 19.5 },
  },
  {
    match: "l40s",
    label: "L40S",
    dramGBs: 864,
    tflops: { fp8: 733, bf16: 362, tf32: 183, fp32: 91.6 },
  },
  {
    match: "4090",
    label: "RTX 4090",
    dramGBs: 1008,
    tflops: { fp8: 330, bf16: 165, tf32: 82.6, fp32: 82.6 },
  },
  {
    match: "3090",
    label: "RTX 3090",
    dramGBs: 936,
    tflops: { bf16: 71, tf32: 35.6, fp32: 35.6 },
  },
  {
    match: "nvidia l4",
    label: "L4",
    dramGBs: 300,
    tflops: { fp8: 242, bf16: 121, tf32: 60, fp32: 30.3 },
  },
  {
    match: "t4",
    label: "T4",
    dramGBs: 320,
    tflops: { bf16: 65, fp32: 8.1 },
  },
  // AMD CDNA3 / CDNA4 datasheets (dense matrix peaks).
  {
    match: "mi355x",
    label: "MI355X",
    dramGBs: 8000,
    tflops: { fp4: 10000, fp8: 5000, bf16: 2500, tf32: 1250, fp32: 157 },
  },
  {
    match: "mi300x",
    label: "MI300X",
    dramGBs: 5300,
    tflops: { fp8: 2615, bf16: 1307, tf32: 654, fp32: 163 },
  },
]

export function hardwareSpec(model: string): HardwareSpec | null {
  const lower = model.toLowerCase()
  return HARDWARE_SPECS.find((spec) => lower.includes(spec.match)) ?? null
}
