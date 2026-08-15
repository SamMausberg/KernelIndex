// PMPP v2 practice boards (problems/pmpp_v2, aggregate scoring, no
// ranking_by in task.yml → statistic "unspecified"). Hand-transcribed from
// gpu-mode/reference-kernels task.yml + reference.py. problem_name/runner
// verified 2026-08-15 against the datasets-server filter slice of
// GPUMODE/kernelbot-data config pmpp_v2_submissions: all eight *_v2 boards
// present (6073 passed rows total), runners A100/B200/H100/L4 (no T4 rows).
import type { CuratedProblem } from "../problems.ts"

const PMPP_GPUS = ["A100", "B200", "H100", "L4"]

export const PMPP_PROBLEMS: CuratedProblem[] = [
  {
    leaderboard: "conv2d_v2",
    slug: "gpumode-conv2d-v2",
    title: "2D convolution",
    family: "conv",
    description:
      "2D convolution with no padding or striding: fp32 input (batch, channels, size, size) convolved with an fp32 kernel (channels, channels, kernelsize, kernelsize), producing (batch, channels, size-kernelsize+1, size-kernelsize+1). Benchmarks vary image size, kernel size, channels, and batch.",
    taskPath: "problems/pmpp_v2/conv2d_py/task.yml",
    axes: {
      size: { role: "variable" },
      kernelsize: { role: "variable" },
      channels: { role: "variable" },
      batch: { role: "variable" },
      seed: { role: "variable" },
      out_size: { role: "derived", expression: "size - kernelsize + 1" },
    },
    inputs: [
      {
        name: "input",
        shape: ["batch", "channels", "size", "size"],
        dtype: "fp32",
      },
      {
        name: "kernel",
        shape: ["channels", "channels", "kernelsize", "kernelsize"],
        dtype: "fp32",
      },
    ],
    outputs: [
      {
        name: "output",
        shape: ["batch", "channels", "out_size", "out_size"],
        dtype: "fp32",
      },
    ],
    tags: ["conv"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        {
          externalId: "0",
          axes: {
            size: 128,
            kernelsize: 8,
            channels: 64,
            batch: 4,
            seed: 54352,
          },
        },
        {
          externalId: "1",
          axes: {
            size: 128,
            kernelsize: 16,
            channels: 64,
            batch: 4,
            seed: 93246,
          },
        },
        {
          externalId: "2",
          axes: {
            size: 256,
            kernelsize: 16,
            channels: 128,
            batch: 2,
            seed: 6256,
          },
        },
        {
          externalId: "3",
          axes: {
            size: 256,
            kernelsize: 16,
            channels: 128,
            batch: 2,
            seed: 8841,
          },
        },
        {
          externalId: "4",
          axes: {
            size: 256,
            kernelsize: 32,
            channels: 128,
            batch: 1,
            seed: 6252,
          },
        },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "grayscale_v2",
    slug: "gpumode-grayscale-v2",
    title: "RGB to grayscale",
    family: "elementwise",
    description:
      "Convert a square fp32 RGB image (size, size, 3) with values in [0, 1] to grayscale (size, size) using the standard coefficients Y = 0.2989 R + 0.5870 G + 0.1140 B.",
    taskPath: "problems/pmpp_v2/grayscale_py/task.yml",
    axes: {
      size: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "x", shape: ["size", "size", 3], dtype: "fp32" }],
    outputs: [{ name: "y", shape: ["size", "size"], dtype: "fp32" }],
    tags: ["elementwise"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { size: 512, seed: 54352 } },
        { externalId: "1", axes: { size: 1024, seed: 93246 } },
        { externalId: "2", axes: { size: 2048, seed: 6256 } },
        { externalId: "3", axes: { size: 4096, seed: 8841 } },
        { externalId: "4", axes: { size: 8192, seed: 6252 } },
        { externalId: "5", axes: { size: 16384, seed: 54352 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "histogram_v2",
    slug: "gpumode-histogram-v2",
    title: "Histogram",
    family: "histogram",
    // task.yml prose still describes an older variant (0-100 range, size/16
    // bins); reference.py — the checked definition — buckets uint8 values
    // into 256 int64 bins, so we transcribe that.
    description:
      "Count the occurrences of each byte value of a uint8 array (size,) into 256 int64 bins. A contention parameter sets the percentage of elements overwritten with one shared value to stress atomic contention.",
    taskPath: "problems/pmpp_v2/histogram_py/task.yml",
    axes: {
      size: { role: "variable" },
      contention: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "data", shape: ["size"], dtype: "uint8" }],
    outputs: [{ name: "output", shape: [256], dtype: "int64" }],
    tags: ["histogram"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        {
          externalId: "0",
          axes: { size: 1310720, contention: 10, seed: 6252 },
        },
        {
          externalId: "1",
          axes: { size: 2621440, contention: 10, seed: 8841 },
        },
        {
          externalId: "2",
          axes: { size: 2621440, contention: 40, seed: 3411 },
        },
        {
          externalId: "3",
          axes: { size: 2621440, contention: 90, seed: 8753 },
        },
        {
          externalId: "4",
          axes: { size: 5242880, contention: 10, seed: 6252 },
        },
        {
          externalId: "5",
          axes: { size: 10485760, contention: 10, seed: 8841 },
        },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "matmul_v2",
    slug: "gpumode-matmul-v2",
    title: "FP16 matmul",
    family: "gemm",
    description:
      "Plain fp16 matrix multiply: a (m×k) @ b (k×n) into a pre-allocated fp16 c (m×n). All outer and inner dimensions are multiples of 16.",
    taskPath: "problems/pmpp_v2/matmul_py/task.yml",
    axes: {
      m: { role: "variable" },
      n: { role: "variable" },
      k: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [
      { name: "a", shape: ["m", "k"], dtype: "fp16" },
      { name: "b", shape: ["k", "n"], dtype: "fp16" },
    ],
    outputs: [{ name: "c", shape: ["m", "n"], dtype: "fp16" }],
    tags: ["gemm"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { m: 128, n: 128, k: 128, seed: 43214 } },
        { externalId: "1", axes: { m: 256, n: 256, k: 256, seed: 423011 } },
        { externalId: "2", axes: { m: 512, n: 512, k: 512, seed: 123456 } },
        { externalId: "3", axes: { m: 1024, n: 1024, k: 1024, seed: 1029 } },
        { externalId: "4", axes: { m: 2048, n: 2048, k: 2048, seed: 75342 } },
        { externalId: "5", axes: { m: 1024, n: 1536, k: 1024, seed: 321 } },
        { externalId: "6", axes: { m: 2048, n: 3072, k: 2048, seed: 32412 } },
        { externalId: "7", axes: { m: 4096, n: 5120, k: 4096, seed: 123456 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "prefixsum_v2",
    slug: "gpumode-prefixsum-v2",
    title: "Inclusive prefix sum",
    family: "scan",
    description:
      "Inclusive prefix sum (scan) over a 1-D fp32 tensor of size n: each output position holds the cumulative sum of all elements up to it. The checker tolerance is scaled by the square root of the input size for numerical stability.",
    taskPath: "problems/pmpp_v2/prefixsum_py/task.yml",
    axes: {
      size: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "data", shape: ["size"], dtype: "fp32" }],
    outputs: [{ name: "output", shape: ["size"], dtype: "fp32" }],
    tags: ["scan"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { size: 262144, seed: 12345 } },
        { externalId: "1", axes: { size: 524288, seed: 67890 } },
        { externalId: "2", axes: { size: 1048576, seed: 13579 } },
        { externalId: "3", axes: { size: 2097152, seed: 24680 } },
        { externalId: "4", axes: { size: 4194304, seed: 35791 } },
        { externalId: "5", axes: { size: 8388608, seed: 46802 } },
        { externalId: "6", axes: { size: 16777216, seed: 57913 } },
        { externalId: "7", axes: { size: 33554432, seed: 68024 } },
        { externalId: "8", axes: { size: 67108864, seed: 79135 } },
        { externalId: "9", axes: { size: 134217728, seed: 80246 } },
        { externalId: "10", axes: { size: 268435456, seed: 91357 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "sort_v2",
    slug: "gpumode-sort-v2",
    title: "Sort",
    family: "sort",
    description:
      "Sort a 1-D fp32 array of the given size in ascending order with any algorithm. Inputs are generated as rows of a roughly square matrix, each drawn from a normal distribution with a per-row mean, then flattened.",
    taskPath: "problems/pmpp_v2/sort_py/task.yml",
    axes: {
      size: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "data", shape: ["size"], dtype: "fp32" }],
    outputs: [{ name: "output", shape: ["size"], dtype: "fp32" }],
    tags: ["sort"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { size: 100000, seed: 54352 } },
        { externalId: "1", axes: { size: 500000, seed: 93246 } },
        { externalId: "2", axes: { size: 1000000, seed: 6256 } },
        { externalId: "3", axes: { size: 10000000, seed: 8841 } },
        { externalId: "4", axes: { size: 100000000, seed: 6252 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "vectoradd_v2",
    slug: "gpumode-vectoradd-v2",
    title: "FP16 vector addition",
    family: "elementwise",
    description:
      "Elementwise addition of two fp16 tensors of shape (size, size) drawn from a standard normal distribution, into a pre-allocated fp16 output of the same shape.",
    taskPath: "problems/pmpp_v2/vectoradd_py/task.yml",
    axes: {
      size: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [
      { name: "a", shape: ["size", "size"], dtype: "fp16" },
      { name: "b", shape: ["size", "size"], dtype: "fp16" },
    ],
    outputs: [{ name: "c", shape: ["size", "size"], dtype: "fp16" }],
    tags: ["elementwise"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { size: 1024, seed: 31232 } },
        { externalId: "1", axes: { size: 2048, seed: 4052 } },
        { externalId: "2", axes: { size: 4096, seed: 2146 } },
        { externalId: "3", axes: { size: 8192, seed: 3129 } },
        { externalId: "4", axes: { size: 16384, seed: 54352 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
  {
    leaderboard: "vectorsum_v2",
    slug: "gpumode-vectorsum-v2",
    title: "Vector sum reduction",
    family: "reduction",
    description:
      "Sum all elements of a 1-D fp32 tensor (size,) into a scalar. Inputs are normally distributed values with a random offset and scale applied.",
    taskPath: "problems/pmpp_v2/vectorsum_py/task.yml",
    axes: {
      size: { role: "variable" },
      seed: { role: "variable" },
    },
    inputs: [{ name: "data", shape: ["size"], dtype: "fp32" }],
    outputs: [{ name: "output", shape: [1], dtype: "fp32" }],
    tags: ["reduction"],
    config: "pmpp_v2_submissions",
    scoring: "aggregate",
    suite: {
      statistic: "unspecified",
      cases: [
        { externalId: "0", axes: { size: 1638400, seed: 93246 } },
        { externalId: "1", axes: { size: 3276800, seed: 6256 } },
        { externalId: "2", axes: { size: 6553600, seed: 8841 } },
        { externalId: "3", axes: { size: 13107200, seed: 6252 } },
        { externalId: "4", axes: { size: 26214400, seed: 82135 } },
        { externalId: "5", axes: { size: 52428800, seed: 12345 } },
      ],
    },
    gpus: PMPP_GPUS,
  },
]
