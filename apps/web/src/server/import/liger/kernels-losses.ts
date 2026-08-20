// Curated Liger benchmark kernels, loss tranche (2026-08-20): divergence
// losses, fused LM-head losses, distillation, and alignment (preference)
// losses. Signatures verified against the era-exact benchmark scripts that
// produced the CSV rows; binders guard on that era's config keys.
import { dtypeOf, int, type LigerKernelSpec } from "./types.ts"

/** kl_div/tvd era: x=V sweep over [B*T, V] fp32 probability tensors. */
const tokensVocab: LigerKernelSpec["bind"] = (x, xName, config) => {
  const batch = int(config.B)
  const seq = int(config.T)
  if (!batch || !seq || xName !== "V") return null
  return { axes: { tokens: batch * seq, vocab: x }, dtype: "fp32" }
}

/** Chunked preference losses (orpo/cpo/simpo): x=B sweep, [B, T, H] input
 * against a [V, H] LM head with [B, T] integer targets, scalar loss. */
function preferenceEntry(
  csvName: string,
  slug: string,
  family: string,
  title: string,
  description: string,
): LigerKernelSpec {
  return {
    csvName,
    slug,
    family,
    title,
    description,
    inputs: [
      { name: "x", shape: ["batch", "seq", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "target", shape: ["batch", "seq"], dtype: "int64" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const seq = int(config.T)
      const hidden = int(config.H)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      if (!seq || !hidden || !vocab || !dtype || xName !== "B") return null
      return { axes: { batch: x, seq, hidden, vocab }, dtype }
    },
  }
}

/** Chunked distillation losses: bf16 student at hidden/2 and teacher at
 * hidden project through separate [V, ·] heads; hard targets ride along. */
function distillEntry(
  csvName: string,
  slug: string,
  family: string,
  title: string,
  description: string,
): LigerKernelSpec {
  return {
    csvName,
    slug,
    family,
    title,
    description,
    inputs: [
      {
        name: "student_input",
        shape: ["tokens", "student_hidden"],
        dtype: "cfg",
      },
      {
        name: "student_weight",
        shape: ["vocab", "student_hidden"],
        dtype: "cfg",
      },
      { name: "teacher_input", shape: ["tokens", "hidden"], dtype: "cfg" },
      { name: "teacher_weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "target", shape: ["tokens"], dtype: "int64" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    derived: { student_hidden: "hidden // 2" },
    bind: (x, xName, config) => {
      const hidden = int(config.H)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      const hard = config.weight_hard_loss
      const soft = config.weight_soft_loss
      if (!hidden || !vocab || !dtype || xName !== "BT") return null
      if (config.bias !== false || hidden % 2 !== 0) return null
      if (typeof hard !== "number" || typeof soft !== "number") return null
      return {
        axes: { tokens: x, hidden, vocab },
        dtype,
        scalars: { weight_hard_loss: hard, weight_soft_loss: soft },
      }
    },
  }
}

/** GRPO policy loss on precomputed logits (token/sequence importance
 * sampling): logits cover one extra position beyond the completion ids. */
function grpoEntry(
  csvName: string,
  slug: string,
  level: string,
): LigerKernelSpec {
  return {
    csvName,
    slug,
    family: "grpo",
    title: `GRPO loss, ${level}-level importance sampling`,
    description: `GRPO policy loss over batch×(seq+1)×vocab logits with per-sequence advantages and ${level}-level importance sampling (clip 0.2, no KL reference term).`,
    inputs: [
      { name: "logits", shape: ["batch", "seq_next", "vocab"], dtype: "cfg" },
      { name: "completion_ids", shape: ["batch", "seq"], dtype: "int64" },
      { name: "advantages", shape: ["batch"], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    derived: { seq_next: "seq + 1" },
    bind: (x, xName, config) => {
      const seq = int(config.T)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      if (!seq || !vocab || !dtype || xName !== "B") return null
      if (config.importance_sampling_level !== level) return null
      return { axes: { batch: x, seq, vocab }, dtype }
    },
  }
}

export const LOSS_KERNELS: LigerKernelSpec[] = [
  {
    csvName: "kl_div",
    slug: "liger-kl-div",
    family: "kl-divergence",
    title: "KL-divergence loss",
    description:
      "KL divergence between tokens×vocab log-probabilities and target probabilities (batchmean reduction); the benchmark generates fp32 inputs.",
    inputs: [
      { name: "log_probs", shape: ["tokens", "vocab"], dtype: "cfg" },
      { name: "target_probs", shape: ["tokens", "vocab"], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: tokensVocab,
  },
  {
    csvName: "tvd",
    slug: "liger-tvd",
    family: "tvd",
    title: "Total variation distance loss",
    description:
      "Total variation distance between two tokens×vocab probability distributions (batchmean reduction); the benchmark generates fp32 inputs.",
    inputs: [
      { name: "p", shape: ["tokens", "vocab"], dtype: "cfg" },
      { name: "q", shape: ["tokens", "vocab"], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: tokensVocab,
  },
  {
    csvName: "fused_linear_cross_entropy",
    slug: "liger-fused-linear-cross-entropy",
    family: "cross-entropy",
    title: "Fused linear + cross-entropy",
    description:
      "LM-head projection of tokens×hidden activations through a vocab×hidden weight fused with cross-entropy against integer targets, without materializing the logits.",
    inputs: [
      { name: "x", shape: ["tokens", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "target", shape: ["tokens"], dtype: "int64" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const hidden = int(config.H)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      if (!hidden || !vocab || !dtype || xName !== "BT") return null
      return { axes: { tokens: x, hidden, vocab }, dtype }
    },
  },
  {
    csvName: "fused_linear_jsd",
    slug: "liger-fused-linear-jsd",
    family: "jsd",
    title: "Fused linear + JSD",
    description:
      "Student and teacher tokens×hidden activations projected through separate vocab×hidden heads fused with generalized JSD (beta 0.5, batchmean) between the resulting log-distributions.",
    inputs: [
      { name: "student_input", shape: ["tokens", "hidden"], dtype: "cfg" },
      { name: "student_weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "teacher_input", shape: ["tokens", "hidden"], dtype: "cfg" },
      { name: "teacher_weight", shape: ["vocab", "hidden"], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const hidden = int(config.H)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      if (!hidden || !vocab || !dtype || xName !== "BT") return null
      return {
        axes: { tokens: x, hidden, vocab },
        dtype,
        scalars: { beta: 0.5 },
      }
    },
  },
  distillEntry(
    "distill_jsd_loss",
    "liger-distill-jsd-loss",
    "jsd",
    "Chunked distillation JSD loss",
    "Distillation loss combining hard cross-entropy and soft JSD between a hidden/2 student and a hidden teacher, each projected through its own LM head (equal hard/soft weights).",
  ),
  distillEntry(
    "distill_cosine_loss",
    "liger-distill-cosine-loss",
    "cosine-similarity-loss",
    "Chunked distillation cosine loss",
    "Distillation loss combining hard cross-entropy and a soft cosine-similarity term between a hidden/2 student and a hidden teacher, each projected through its own LM head (equal hard/soft weights).",
  ),
  preferenceEntry(
    "fused_linear_orpo_loss",
    "liger-fused-linear-orpo-loss",
    "orpo",
    "Fused linear + ORPO loss",
    "ORPO preference loss over batch×seq×hidden activations projected through a vocab×hidden LM head against integer targets, computed chunked without materializing logits.",
  ),
  preferenceEntry(
    "fused_linear_cpo_loss",
    "liger-fused-linear-cpo-loss",
    "cpo",
    "Fused linear + CPO loss",
    "CPO preference loss over batch×seq×hidden activations projected through a vocab×hidden LM head against integer targets, computed chunked without materializing logits.",
  ),
  preferenceEntry(
    "fused_linear_simpo_loss",
    "liger-fused-linear-simpo-loss",
    "simpo",
    "Fused linear + SimPO loss",
    "SimPO preference loss over batch×seq×hidden activations projected through a vocab×hidden LM head against integer targets, computed chunked without materializing logits.",
  ),
  {
    csvName: "kto_loss",
    slug: "liger-fused-linear-kto-loss",
    family: "kto",
    title: "Fused linear + KTO loss",
    description:
      "KTO preference loss: policy and reference batch×seq×hidden activations project through separate biased vocab×hidden LM heads against integer targets, with per-sequence boolean preference labels and a precomputed KL term (beta 0.1).",
    inputs: [
      { name: "x", shape: ["batch", "seq", "hidden"], dtype: "cfg" },
      { name: "ref_x", shape: ["batch", "seq", "hidden"], dtype: "cfg" },
      { name: "weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "bias", shape: ["vocab"], dtype: "cfg" },
      { name: "ref_weight", shape: ["vocab", "hidden"], dtype: "cfg" },
      { name: "ref_bias", shape: ["vocab"], dtype: "cfg" },
      { name: "target", shape: ["batch", "seq"], dtype: "int64" },
      { name: "preference_labels", shape: ["batch"], dtype: "bool" },
      { name: "kl", shape: [1], dtype: "cfg" },
    ],
    outputs: [{ name: "loss", shape: [1], dtype: "cfg" }],
    bind: (x, xName, config) => {
      const seq = int(config.T)
      const hidden = int(config.H)
      const vocab = int(config.V)
      const dtype = dtypeOf(config.dtype)
      const beta = config.beta
      if (!seq || !hidden || !vocab || !dtype || xName !== "B") return null
      if (config.bias !== true || typeof beta !== "number") return null
      return {
        axes: { batch: x, seq, hidden, vocab },
        dtype,
        scalars: { beta },
      }
    },
  },
  grpoEntry("fused_linear_grpo_loss_token", "liger-grpo-loss-token", "token"),
  grpoEntry(
    "fused_linear_grpo_loss_sequence",
    "liger-grpo-loss-sequence",
    "sequence",
  ),
]
