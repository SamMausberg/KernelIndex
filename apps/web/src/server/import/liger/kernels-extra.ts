// Curated Liger benchmark kernels, second tranche (2026-08-20): norms,
// activations, attention variants, MoE, and the Megatron-layout ops. Every
// signature was verified against the benchmark script revision that produced
// the CSV rows (era-exact commits fetched per row date); binders guard on the
// exact config keys that era wrote and return null for anything else.
import { dtypeOf, eps, int, type LigerKernelSpec } from "./types.ts"

export const EXTRA_KERNELS: LigerKernelSpec[] = [
  {
    csvName: "relu_squared",
    slug: "liger-relu-squared",
    family: "relu-squared",
    title: "ReLU squared",
    description:
      "Elementwise relu(x)^2 activation over a rows×hidden tensor; the benchmark sweeps the hidden size.",
    inputs: [{ name: "x", shape: ["rows", "hidden"], dtype: "cfg" }],
    outputs: [{ name: "y", shape: ["rows", "hidden"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const rows = int(config.M)
      const dtype = dtypeOf(config.dtype)
      if (!rows || !dtype || xName !== "N") return null
      return { axes: { rows, hidden: x }, dtype }
    },
  },
  {
    csvName: "group_norm",
    slug: "liger-group-norm",
    family: "groupnorm",
    title: "GroupNorm",
    description:
      "Group normalization of a batch×channels×hidden tensor with affine channel weight and bias; groups = channels / channels_per_group.",
    inputs: [
      { name: "x", shape: ["batch", "channels", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["channels"], dtype: "cfg" },
      { name: "bias", shape: ["channels"], dtype: "cfg" },
    ],
    outputs: [
      { name: "y", shape: ["batch", "channels", "hidden"], dtype: "cfg" },
    ],
    derived: { groups: "channels // channels_per_group" },
    bind: (x, xName, config) => {
      const batch = int(config.M)
      const hidden = int(config.H)
      const perGroup = int(config.channels_per_group)
      const dtype = dtypeOf(config.dtype)
      const epsilon = eps(config.eps)
      if (!batch || !hidden || !perGroup || !dtype || !epsilon) return null
      if (xName !== "C" || x % perGroup !== 0) return null
      return {
        axes: { batch, channels: x, hidden, channels_per_group: perGroup },
        dtype,
        scalars: { eps: epsilon },
      }
    },
  },
  {
    csvName: "sparsemax",
    slug: "liger-sparsemax",
    family: "sparsemax",
    title: "Sparsemax",
    description:
      "Sparsemax projection over the last dimension of a tokens×features tensor.",
    inputs: [{ name: "x", shape: ["tokens", "features"], dtype: "cfg" }],
    outputs: [{ name: "y", shape: ["tokens", "features"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const batch = int(config.B)
      const seq = int(config.T)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !seq || !dtype) return null
      if (xName !== "V" || config.dim !== -1) return null
      return { axes: { tokens: batch * seq, features: x }, dtype }
    },
  },
  {
    csvName: "llama4_rope",
    slug: "liger-llama4-rope",
    family: "rope",
    title: "Llama 4 rotary position embedding",
    description:
      "Llama-4-style rotary embedding applied to query and key tensors in batch×seq×heads×head_dim layout (batch 1, complex-frequency formulation).",
    inputs: [
      { name: "q", shape: [1, "seq", "q_heads", "head_dim"], dtype: "cfg" },
      { name: "k", shape: [1, "seq", "kv_heads", "head_dim"], dtype: "cfg" },
    ],
    outputs: [
      { name: "q_out", shape: [1, "seq", "q_heads", "head_dim"], dtype: "cfg" },
      {
        name: "k_out",
        shape: [1, "seq", "kv_heads", "head_dim"],
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
    csvName: "megatron_rms_norm",
    slug: "liger-megatron-rms-norm",
    family: "rmsnorm",
    title: "RMSNorm, Megatron layout",
    description:
      "RMSNorm over the hidden dimension of a seq×batch×hidden activation (Megatron sbh layout) with a learned hidden-size weight; the benchmark runs bf16.",
    inputs: [
      { name: "x", shape: ["seq", "batch", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["seq", "batch", "hidden"], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const seq = int(config.S)
      const batch = int(config.B)
      if (!seq || !batch || xName !== "H") return null
      return {
        axes: { seq, batch, hidden: x },
        dtype: "bf16",
        scalars: { eps: 1e-6 },
      }
    },
  },
  {
    csvName: "megatron_swiglu",
    slug: "liger-megatron-swiglu",
    family: "swiglu",
    title: "SwiGLU activation, Megatron layout",
    description:
      "SwiGLU activation over a seq×batch×(2·ffn) tensor: chunk in two on the last dimension, silu(gate)·up. The projections are outside the timed region; the benchmark runs bf16 and sweeps the per-rank FFN size.",
    inputs: [
      { name: "y", shape: ["seq", "batch", "ffn_double"], dtype: "cfg" },
    ],
    outputs: [{ name: "out", shape: ["seq", "batch", "ffn"], dtype: "cfg" }],
    derived: { ffn_double: "ffn * 2" },
    bind: (x, xName, config) => {
      const seq = int(config.S)
      const batch = int(config.B)
      if (!seq || !batch || xName !== "ffn_local") return null
      return { axes: { seq, batch, ffn: x }, dtype: "bf16" }
    },
  },
  {
    csvName: "megatron_cross_entropy",
    slug: "liger-megatron-cross-entropy",
    family: "cross-entropy",
    title: "Vocab-parallel cross-entropy, Megatron layout",
    description:
      "Vocab-parallel cross-entropy over seq×batch×vocab bf16 logits against integer targets, returning per-token fp32 losses. Only TP=1 rows import; sharded-vocab rows would change the local logits shape.",
    inputs: [
      { name: "logits", shape: ["seq", "batch", "vocab"], dtype: "cfg" },
      { name: "target", shape: ["seq", "batch"], dtype: "int64" },
    ],
    outputs: [{ name: "loss", shape: ["seq", "batch"], dtype: "fp32" }],
    bind: (x, xName, config) => {
      const seq = int(config.S)
      const batch = int(config.B)
      if (!seq || !batch || xName !== "V" || config.TP !== 1) return null
      return { axes: { seq, batch, vocab: x }, dtype: "bf16" }
    },
  },
  {
    csvName: "fused_moe",
    slug: "liger-fused-moe",
    family: "moe",
    title: "Fused MoE expert MLP",
    description:
      "Top-k routed mixture-of-experts silu-gated MLP: tokens×hidden activations dispatched to experts holding fused gate/up and down projections, weighted by softmaxed router scores.",
    inputs: [
      { name: "x", shape: ["tokens", "hidden"], dtype: "cfg" },
      {
        name: "gate_up_proj",
        shape: ["experts", "intermediate_double", "hidden"],
        dtype: "cfg",
      },
      {
        name: "down_proj",
        shape: ["experts", "hidden", "intermediate"],
        dtype: "cfg",
      },
      { name: "top_k_index", shape: ["tokens", "k"], dtype: "int32" },
      { name: "top_k_weights", shape: ["tokens", "k"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["tokens", "hidden"], dtype: "cfg" }],
    derived: { intermediate_double: "intermediate * 2" },
    bind: (x, xName, config) => {
      const hidden = int(config.H)
      const intermediate = int(config.intermediate_dim)
      const k = int(config.K)
      const dtype = dtypeOf(config.dtype)
      if (!hidden || !intermediate || !k || !dtype) return null
      const tokens = xName === "T" ? x : int(config.T)
      const experts = xName === "E" ? x : int(config.E)
      if (!tokens || !experts || (xName !== "T" && xName !== "E")) return null
      return { axes: { tokens, hidden, intermediate, experts, k }, dtype }
    },
  },
  {
    csvName: "fused_neighborhood_attention",
    slug: "liger-fused-neighborhood-attention",
    family: "neighborhood-attention",
    title: "Fused neighborhood attention",
    description:
      "Neighborhood attention module over batch×seq×hidden states: q/k/v projections, banded (kernel_size, dilation) softmax attention, and output projection — the projections are inside the timed module.",
    inputs: [
      {
        name: "hidden_states",
        shape: ["batch", "seq", "hidden"],
        dtype: "cfg",
      },
      { name: "q_weight", shape: ["hidden", "hidden"], dtype: "cfg" },
      { name: "k_weight", shape: ["hidden", "hidden"], dtype: "cfg" },
      { name: "v_weight", shape: ["hidden", "hidden"], dtype: "cfg" },
      { name: "out_weight", shape: ["hidden", "hidden"], dtype: "cfg" },
      { name: "q_bias", shape: ["hidden"], dtype: "cfg" },
      { name: "k_bias", shape: ["hidden"], dtype: "cfg" },
      { name: "v_bias", shape: ["hidden"], dtype: "cfg" },
      { name: "out_bias", shape: ["hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "y", shape: ["batch", "seq", "hidden"], dtype: "cfg" }],
    derived: { head_dim: "hidden // heads" },
    bind: (x, xName, config) => {
      const batch = int(config.batch_size)
      const hidden = int(config.hidden_size)
      const heads = int(config.num_heads)
      const kernel = int(config.kernel_size)
      const dilation = int(config.dilation)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !hidden || !heads || !kernel || !dilation || !dtype)
        return null
      if (xName !== "seq_len" || config.bias !== true) return null
      if (hidden % heads !== 0) return null
      return {
        axes: {
          batch,
          seq: x,
          hidden,
          heads,
          kernel_size: kernel,
          dilation,
        },
        dtype,
      }
    },
  },
]

/** scores [B, C_in, L, L] → causal mask → (softmax | sparsemax) → grouped
 * K×K convolution → masked [B, C_out, L, L] (multi-token attention). */
function mtaEntry(
  csvName: string,
  slug: string,
  title: string,
  activation: string,
): LigerKernelSpec {
  return {
    csvName,
    slug,
    family: "multi-token-attention",
    title,
    description: `Multi-token attention over batch×heads_in×seq×seq scores: causal mask, ${activation}, then a K×K convolution to heads_out with bias, re-masked causally.`,
    inputs: [
      {
        name: "scores",
        shape: ["batch", "heads_in", "seq", "seq"],
        dtype: "cfg",
      },
      {
        name: "weight",
        shape: ["heads_out", "heads_in", "k", "k"],
        dtype: "cfg",
      },
      { name: "bias", shape: ["heads_out"], dtype: "cfg" },
    ],
    outputs: [
      { name: "y", shape: ["batch", "heads_out", "seq", "seq"], dtype: "cfg" },
    ],
    bind: (x, xName, config) => {
      const batch = int(config.B)
      const headsIn = int(config.C_in)
      const headsOut = int(config.C_out)
      const k = int(config.K)
      const dtype = dtypeOf(config.dtype)
      if (!batch || !headsIn || !headsOut || !k || !dtype) return null
      if (xName !== "L" || config.groups !== 1 || config.bias !== true)
        return null
      return {
        axes: { batch, heads_in: headsIn, heads_out: headsOut, seq: x, k },
        dtype,
      }
    },
  }
}

/** Tiled MLP rows: same math as the plain SwiGLU/GeGLU MLP; the tiled
 * (seq-sharded) execution is the implementations' strategy, so the spec
 * carries the module semantics and the sharding stays with the providers. */
function tiledMlpEntry(
  csvName: string,
  slug: string,
  title: string,
  description: string,
  act: string,
): LigerKernelSpec {
  return {
    csvName,
    slug,
    family: csvName === "tiled_swiglu" ? "swiglu" : "geglu",
    title,
    description,
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
      if (xName !== "T" || config.hidden_act !== act) return null
      return { axes: { batch, seq: x, hidden, intermediate }, dtype }
    },
  }
}

EXTRA_KERNELS.push(
  mtaEntry(
    "multi_token_attention",
    "liger-multi-token-attention",
    "Multi-token attention",
    "softmax",
  ),
  mtaEntry(
    "sparse_multi_token_attention",
    "liger-sparse-multi-token-attention",
    "Sparse multi-token attention",
    "sparsemax",
  ),
  tiledMlpEntry(
    "tiled_swiglu",
    "liger-tiled-swiglu",
    "SwiGLU MLP (tiled benchmark)",
    "Llama-style SwiGLU MLP over batch×seq×hidden activations; providers include seq-sharded tiled executions of the same computation.",
    "silu",
  ),
  tiledMlpEntry(
    "tiled_geglu",
    "liger-tiled-geglu",
    "GeGLU MLP (tiled benchmark)",
    "GeGLU MLP (tanh-approximated GELU gate) over batch×seq×hidden activations; providers include seq-sharded tiled executions of the same computation.",
    "gelu_pytorch_tanh",
  ),
)
