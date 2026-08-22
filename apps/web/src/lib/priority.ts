/** The workloads an inference engineer asks about first, on the GPUs they
 * ask about first (§2.3 coverage gaps). Editorial priority order; wherever
 * these are used, a zero is a stated gap, never a claim. */
export const HERO_GPUS = ["NVIDIA H100", "NVIDIA B200"]
export const HERO_FAMILIES = [
  "gqa-paged-attention",
  "gqa-ragged-attention",
  "mla-paged-attention",
  "gemm",
  "moe",
  "rmsnorm",
  "layernorm",
  "softmax",
  "rope",
  "mlp",
]
