// Helion kernel boards (problems/helion, B200_Nebius, aggregate scoring).
// Hand-transcribed from gpu-mode/reference-kernels task.yml (which fully
// specifies each I/O contract). problem_name/runner verified 2026-08-15
// against the datasets-server filter slice of GPUMODE/kernelbot-data config
// helion_b200_nebius: causal_conv1d (38), fp8_quant (19),
// gated_deltanet_chunk_fwd_h (31), gated_deltanet_chunk_fwd_o (15),
// gated_deltanet_recompute_w_u (30) — all B200_Nebius, the full 133 rows.
// Leaderboard names drop the repo's _py directory suffix.
//
// Upstream task parameters are uppercase (B, T, H, K, V, ...); axis names
// are lowercased here to satisfy the axis-name grammar.
import type { CuratedProblem } from "../problems.ts"

export const HELION_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "causal_conv1d",
    slug: "gpumode-causal-conv1d",
    title: "Causal depthwise conv1d",
    family: "conv",
    description:
      "Causal depthwise 1D convolution, a core component of Mamba/Mamba-2 architectures: each channel is convolved independently with causal left zero-padding, so out[b, d, t] = bias[d] + sum_k weight[d, k] * x[b, d, t-w+1+k]. All tensors are fp32.",
    taskPath: "problems/helion/causal_conv1d_py/task.yml",
    axes: {
      b: { role: "variable" },
      d: { role: "variable" },
      s: { role: "variable" },
      w: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [
      { name: "x", shape: ["b", "d", "s"], dtype: "fp32" },
      { name: "weight", shape: ["d", "w"], dtype: "fp32" },
      { name: "bias", shape: ["d"], dtype: "fp32" },
    ],
    outputs: [{ name: "out", shape: ["b", "d", "s"], dtype: "fp32" }],
    tags: ["conv"],
    config: "helion_b200_nebius",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        { externalId: "0", axes: { b: 1, d: 1536, s: 2048, w: 4, seed: 2146 } },
        { externalId: "1", axes: { b: 1, d: 2560, s: 2048, w: 4, seed: 3129 } },
        {
          externalId: "2",
          axes: { b: 1, d: 2560, s: 4096, w: 4, seed: 54352 },
        },
      ],
    },
    gpus: ["B200_Nebius"],
  },
  {
    leaderboard: "fp8_quant",
    slug: "gpumode-fp8-quant",
    title: "Per-group FP8 quantization",
    family: "quantization",
    description:
      "Per-token-group FP8 E4M3 activation quantization as used in W8A8 LLM inference: for each group of group_size contiguous elements, scale = max(absmax, eps) / 448 and x_q = clamp(x / scale, -448, 448). Outputs are fp32 clamped to the FP8 range, written into pre-allocated x_q and per-group scale x_s tensors.",
    taskPath: "problems/helion/fp8_quant_py/task.yml",
    axes: {
      num_tokens: { role: "variable" },
      hidden_dim: { role: "variable" },
      group_size: { role: "variable" },
      seed: { role: "variable" },
      num_groups: { role: "derived", expression: "hidden_dim // group_size" },
    },
    inputs: [{ name: "x", shape: ["num_tokens", "hidden_dim"], dtype: "fp32" }],
    outputs: [
      { name: "x_q", shape: ["num_tokens", "hidden_dim"], dtype: "fp32" },
      { name: "x_s", shape: ["num_tokens", "num_groups"], dtype: "fp32" },
    ],
    tags: ["quantization"],
    config: "helion_b200_nebius",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: {
            num_tokens: 256,
            hidden_dim: 4096,
            group_size: 128,
            seed: 2146,
          },
        },
        {
          externalId: "1",
          axes: {
            num_tokens: 256,
            hidden_dim: 8192,
            group_size: 128,
            seed: 3129,
          },
        },
        {
          externalId: "2",
          axes: {
            num_tokens: 4096,
            hidden_dim: 7168,
            group_size: 128,
            seed: 54352,
          },
        },
      ],
    },
    gpus: ["B200_Nebius"],
  },
  {
    leaderboard: "gated_deltanet_chunk_fwd_h",
    slug: "gpumode-gated-deltanet-chunk-fwd-h",
    title: "Gated DeltaNet chunk_fwd_h",
    family: "gated-deltanet",
    description:
      "The chunk_fwd_h inter-chunk state recurrence of Gated DeltaNet (arXiv:2412.06464): maintain a [k, v] hidden state across chunks of 64 timesteps — sequential over chunks, parallel over (b, h) — emitting the per-chunk states h and gate-corrected values v_new. All tensors are fp32; t must be a multiple of 64.",
    taskPath: "problems/helion/gated_deltanet_chunk_fwd_h_py/task.yml",
    axes: {
      b: { role: "variable" },
      t: { role: "variable" },
      h: { role: "variable" },
      k: { role: "variable" },
      v: { role: "variable" },
      seed: { role: "variable" },
      bt: { role: "constant", value: 64 },
      nt: { role: "derived", expression: "t // 64" },
    },
    inputs: [
      { name: "k", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "w", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "u", shape: ["b", "t", "h", "v"], dtype: "fp32" },
      { name: "g", shape: ["b", "t", "h"], dtype: "fp32" },
    ],
    outputs: [
      { name: "h", shape: ["b", "nt", "h", "k", "v"], dtype: "fp32" },
      { name: "v_new", shape: ["b", "t", "h", "v"], dtype: "fp32" },
    ],
    tags: ["gated-deltanet", "linear-attention"],
    config: "helion_b200_nebius",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { b: 1, t: 64, h: 1, k: 64, v: 64, seed: 31232 },
        },
        {
          externalId: "1",
          axes: { b: 2, t: 512, h: 3, k: 64, v: 64, seed: 4052 },
        },
        {
          externalId: "2",
          axes: { b: 2, t: 1024, h: 3, k: 64, v: 64, seed: 2146 },
        },
      ],
    },
    gpus: ["B200_Nebius"],
  },
  {
    leaderboard: "gated_deltanet_chunk_fwd_o",
    slug: "gpumode-gated-deltanet-chunk-fwd-o",
    title: "Gated DeltaNet chunk_fwd_o",
    family: "gated-deltanet",
    description:
      "The chunk_fwd_o output computation of Gated DeltaNet (arXiv:2412.06464): per 64-timestep chunk, combine the inter-chunk contribution q @ h * exp(g) with the causally masked intra-chunk attention over v_new, scaled by k^(-0.5). All tensors are fp32; t must be a multiple of 64.",
    taskPath: "problems/helion/gated_deltanet_chunk_fwd_o_py/task.yml",
    axes: {
      b: { role: "variable" },
      t: { role: "variable" },
      h: { role: "variable" },
      k: { role: "variable" },
      v: { role: "variable" },
      seed: { role: "variable" },
      bt: { role: "constant", value: 64 },
      nt: { role: "derived", expression: "t // 64" },
    },
    inputs: [
      { name: "q", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "k", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "v_new", shape: ["b", "t", "h", "v"], dtype: "fp32" },
      { name: "h", shape: ["b", "nt", "h", "k", "v"], dtype: "fp32" },
      { name: "g", shape: ["b", "t", "h"], dtype: "fp32" },
    ],
    outputs: [{ name: "output", shape: ["b", "t", "h", "v"], dtype: "fp32" }],
    tags: ["gated-deltanet", "linear-attention"],
    config: "helion_b200_nebius",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { b: 1, t: 64, h: 1, k: 64, v: 64, seed: 31232 },
        },
        {
          externalId: "1",
          axes: { b: 2, t: 512, h: 3, k: 64, v: 64, seed: 4052 },
        },
        {
          externalId: "2",
          axes: { b: 2, t: 1024, h: 3, k: 64, v: 64, seed: 2146 },
        },
      ],
    },
    gpus: ["B200_Nebius"],
  },
  {
    leaderboard: "gated_deltanet_recompute_w_u",
    slug: "gpumode-gated-deltanet-recompute-w-u",
    title: "Gated DeltaNet recompute_w_u",
    family: "gated-deltanet",
    description:
      "The recompute_w_u forward kernel of Gated DeltaNet (arXiv:2412.06464): per 64-timestep chunk, compute the WY-transformed values u = A @ (v * beta) and keys w = A @ (k * beta * exp(g)) from the per-chunk WY matrix A. All tensors are fp32; t must be a multiple of 64.",
    taskPath: "problems/helion/gated_deltanet_recompute_w_u_py/task.yml",
    axes: {
      b: { role: "variable" },
      t: { role: "variable" },
      h: { role: "variable" },
      k: { role: "variable" },
      v: { role: "variable" },
      seed: { role: "variable" },
      bt: { role: "constant", value: 64 },
    },
    inputs: [
      { name: "k", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "v", shape: ["b", "t", "h", "v"], dtype: "fp32" },
      { name: "beta", shape: ["b", "t", "h"], dtype: "fp32" },
      { name: "a", shape: ["b", "t", "h", "bt"], dtype: "fp32" },
      { name: "g", shape: ["b", "t", "h"], dtype: "fp32" },
    ],
    outputs: [
      { name: "w", shape: ["b", "t", "h", "k"], dtype: "fp32" },
      { name: "u", shape: ["b", "t", "h", "v"], dtype: "fp32" },
    ],
    tags: ["gated-deltanet", "linear-attention"],
    config: "helion_b200_nebius",
    scoring: "aggregate",
    suite: {
      statistic: "geomean",
      cases: [
        {
          externalId: "0",
          axes: { b: 1, t: 64, h: 1, k: 64, v: 64, seed: 31232 },
        },
        {
          externalId: "1",
          axes: { b: 2, t: 512, h: 3, k: 64, v: 64, seed: 4052 },
        },
        {
          externalId: "2",
          axes: { b: 2, t: 1024, h: 3, k: 64, v: 64, seed: 2146 },
        },
      ],
    },
    gpus: ["B200_Nebius"],
  },
]
