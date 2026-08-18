// Curated Liger benchmark kernels (§14.1 explicit-before-generic): only
// rows whose tensor semantics were verified against the benchmark script
// that produced them import; every other kernel or config shape is counted
// and skipped in the report, never guessed. The CSV spans script eras, so
// each binder guards on the exact config keys its era wrote.
import { DTYPES } from "./types.ts"

export type LigerBinding = {
  /** Concrete integer axis bindings for the workload case. */
  axes: Record<string, number>
  /** Float dtype token for the signature's "cfg" tensors. */
  dtype: string
  scalars?: Record<string, number>
}

type Cfg = Record<string, unknown>

export type LigerKernelSpec = {
  csvName: string
  slug: string
  family: string
  title: string
  description: string
  /** Signature dims are axis names or literal ints; dtype "cfg" means the
      workload's float dtype, anything else is a fixed token. */
  inputs: { name: string; shape: (string | number)[]; dtype: string }[]
  outputs: { name: string; shape: (string | number)[]; dtype: string }[]
  /** Derived axes (§9.1 tiny grammar) computed from the bound axes. */
  derived?: Record<string, string>
  /** Row config → axes, or null when the config shape is not understood. */
  bind: (x: number, xName: string, config: Cfg) => LigerBinding | null
}

const int = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null

const dtypeOf = (value: unknown): string | null =>
  typeof value === "string" ? (DTYPES[value] ?? null) : null

const eps = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null

/** rows×hidden module benchmarks (rms_norm/layer_norm/softmax era config):
 * cfg {M, dtype[, eps]} with the hidden size swept. */
function rowsHiddenBinder(withEps: boolean) {
  return (x: number, xName: string, config: Cfg): LigerBinding | null => {
    const rows = int(config.M)
    const dtype = dtypeOf(config.dtype)
    const epsilon = withEps ? eps(config.eps) : undefined
    if (!rows || !dtype || (withEps && !epsilon)) return null
    if (xName !== "H" && xName !== "N") return null
    return {
      axes: { rows, hidden: x },
      dtype,
      scalars: epsilon ? { eps: epsilon } : undefined,
    }
  }
}

export const LIGER_KERNELS: LigerKernelSpec[] = [
  {
    csvName: "rms_norm",
    slug: "liger-rms-norm",
    family: "rmsnorm",
    title: "RMSNorm",
    description:
      "Root-mean-square normalization of a rows×hidden activation with a learned hidden-size weight.",
    inputs: [
      { name: "x", shape: ["rows", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["rows", "hidden"], dtype: "cfg" }],
    bind: rowsHiddenBinder(true),
  },
  {
    csvName: "fused_add_rms_norm",
    slug: "liger-fused-add-rms-norm",
    family: "rmsnorm",
    title: "Fused add + RMSNorm",
    description:
      "Residual add followed by RMSNorm, returning the normalized activation and the post-add residual.",
    inputs: [
      { name: "x", shape: ["rows", "hidden"], dtype: "cfg" },
      { name: "residual", shape: ["rows", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["hidden"], dtype: "cfg" },
    ],
    outputs: [
      { name: "y", shape: ["rows", "hidden"], dtype: "cfg" },
      { name: "residual_out", shape: ["rows", "hidden"], dtype: "cfg" },
    ],
    bind: rowsHiddenBinder(true),
  },
  {
    csvName: "layer_norm",
    slug: "liger-layer-norm",
    family: "layernorm",
    title: "LayerNorm",
    description:
      "Layer normalization of a rows×hidden activation with learned weight and bias.",
    inputs: [
      { name: "x", shape: ["rows", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["hidden"], dtype: "cfg" },
      { name: "bias", shape: ["hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["rows", "hidden"], dtype: "cfg" }],
    bind: rowsHiddenBinder(true),
  },
  {
    csvName: "softmax",
    slug: "liger-softmax",
    family: "softmax",
    title: "Softmax",
    description: "Softmax over the last dimension of a rows×hidden tensor.",
    inputs: [{ name: "x", shape: ["rows", "hidden"], dtype: "cfg" }],
    outputs: [{ name: "y", shape: ["rows", "hidden"], dtype: "cfg" }],
    bind: rowsHiddenBinder(false),
  },
  {
    csvName: "cross_entropy",
    slug: "liger-cross-entropy",
    family: "cross-entropy",
    title: "Cross-entropy loss",
    description:
      "Cross-entropy loss over tokens×vocab logits against integer targets; the benchmark generates fp32 logits.",
    inputs: [
      { name: "logits", shape: ["tokens", "vocab"], dtype: "cfg" },
      { name: "target", shape: ["tokens"], dtype: "int64" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const batch = int(config.B)
      const seq = int(config.T)
      if (!batch || !seq || xName !== "V") return null
      return { axes: { tokens: batch * seq, vocab: x }, dtype: "fp32" }
    },
  },
  {
    csvName: "jsd",
    slug: "liger-jsd",
    family: "jsd",
    title: "Jensen-Shannon divergence loss",
    description:
      "Generalized JSD between student and teacher log-probabilities over tokens×vocab; the benchmark generates fp32 log-probs.",
    inputs: [
      { name: "student_log_probs", shape: ["tokens", "vocab"], dtype: "cfg" },
      { name: "teacher_log_probs", shape: ["tokens", "vocab"], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      if (xName === "V") {
        const batch = int(config.B)
        const seq = int(config.T)
        if (!batch || !seq) return null
        return { axes: { tokens: batch * seq, vocab: x }, dtype: "fp32" }
      }
      if (xName === "BT") {
        const vocab = int(config.vocab_size)
        if (!vocab) return null
        return { axes: { tokens: x, vocab }, dtype: "fp32" }
      }
      return null
    },
  },
  {
    csvName: "embedding",
    slug: "liger-embedding",
    family: "embedding",
    title: "Embedding lookup",
    description:
      "Embedding table lookup: batch×seq integer ids gathered from a vocab×hidden weight.",
    inputs: [
      { name: "input_ids", shape: ["batch", "seq"], dtype: "int64" },
      { name: "weight", shape: ["vocab", "hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["batch", "seq", "hidden"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const batch = int(config.B)
      const seq = int(config.T)
      const hidden = int(config.D)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !seq || !hidden || !dtype || xName !== "V") return null
      return { axes: { batch, seq, hidden, vocab: x }, dtype }
    },
  },
  {
    csvName: "rope",
    slug: "liger-rope",
    family: "rope",
    title: "Rotary position embedding",
    description:
      "Rotary position embedding applied to query and key tensors (batch 1, Llama-style head layout).",
    inputs: [
      { name: "q", shape: [1, "q_heads", "seq", "head_dim"], dtype: "cfg" },
      { name: "k", shape: [1, "kv_heads", "seq", "head_dim"], dtype: "cfg" },
    ],
    outputs: [
      { name: "q_out", shape: [1, "q_heads", "seq", "head_dim"], dtype: "cfg" },
      {
        name: "k_out",
        shape: [1, "kv_heads", "seq", "head_dim"],
        dtype: "cfg",
      },
    ],
    derived: { head_dim: "hidden // q_heads" },
    bind: (x, xName, config) => {
      const qHeads = int(config.num_q_heads)
      const kvHeads = int(config.num_kv_heads)
      const dtype = dtypeOf(config.dtype)
      if (!qHeads || !kvHeads || !dtype) return null
      const seq = xName === "T" ? x : int(config.seq_len)
      const hidden = xName === "H" ? x : int(config.hidden_size)
      if (!seq || !hidden || hidden % qHeads !== 0) return null
      return {
        axes: { seq, hidden, q_heads: qHeads, kv_heads: kvHeads },
        dtype,
      }
    },
  },
  {
    csvName: "swiglu",
    slug: "liger-swiglu",
    family: "swiglu",
    title: "SwiGLU MLP",
    description:
      "Llama-style SwiGLU MLP: silu(x·Wgate)·(x·Wup) projected back down, over batch×seq×hidden activations.",
    inputs: [
      { name: "x", shape: ["batch", "seq", "hidden"], dtype: "cfg" },
      { name: "w_gate", shape: ["intermediate", "hidden"], dtype: "cfg" },
      { name: "w_up", shape: ["intermediate", "hidden"], dtype: "cfg" },
      { name: "w_down", shape: ["hidden", "intermediate"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["batch", "seq", "hidden"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const batch = int(config.B)
      const hidden = int(config.hidden_size)
      const intermediate = int(config.intermediate_size)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !hidden || !intermediate || !dtype) return null
      if (xName !== "T" || config.hidden_act !== "silu") return null
      return { axes: { batch, seq: x, hidden, intermediate }, dtype }
    },
  },
  {
    csvName: "geglu",
    slug: "liger-geglu",
    family: "geglu",
    title: "GeGLU MLP",
    description:
      "GeGLU MLP (tanh-approximated GELU gate) over batch×seq×hidden activations.",
    inputs: [
      { name: "x", shape: ["batch", "seq", "hidden"], dtype: "cfg" },
      { name: "w_gate", shape: ["intermediate", "hidden"], dtype: "cfg" },
      { name: "w_up", shape: ["intermediate", "hidden"], dtype: "cfg" },
      { name: "w_down", shape: ["hidden", "intermediate"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["batch", "seq", "hidden"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const batch = int(config.bsz)
      const hidden = int(config.hidden_size)
      const intermediate = int(config.intermediate_size)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !hidden || !intermediate || !dtype) return null
      if (xName !== "T" || config.hidden_act !== "gelu_pytorch_tanh")
        return null
      return { axes: { batch, seq: x, hidden, intermediate }, dtype }
    },
  },
]

export const KERNELS_BY_NAME = new Map(
  LIGER_KERNELS.map((kernel) => [kernel.csvName, kernel]),
)

/** The measured pass per operation mode; each is its own OperationSpec. */
export const MODES: Record<string, string> = {
  forward: "the module forward pass",
  backward:
    "the backward pass of the module output given a random upstream gradient",
  full: "the forward pass plus the backward pass",
}
