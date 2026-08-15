// Display naming for imported identifiers (§16.16). Names are aliases over
// stable identity — the digest and slug — so presentation may humanize
// freely; raw identifiers stay visible as canonical IDs wherever a display
// name differs. Pure functions, applied at the read layer.

/** Tokens rendered with technical casing instead of lowercase prose. */
const CASED_TOKENS = [
  "AMD",
  "GPU",
  "GIT",
  "NHWC",
  "VAE",
  "UNet",
  "LM",
  "MTP",
  "SAM",
  "GRN",
  "SSM",
  "FFN",
  "FFT",
  "RFFT",
  "FP8",
  "FP16",
  "FP32",
  "BF16",
  "INT8",
  "INT4",
  "NVFP4",
  "MXFP4",
  "GEMM",
  "GEMV",
  "QR",
  "PMPP",
  "Cholesky",
  "Trimul",
  "MLP",
  "MoE",
  "MLA",
  "GQA",
  "KV",
  "QKV",
  "QK",
  "RMS",
  "IoU",
  "GELU",
  "GeGLU",
  "SiLU",
  "SwiGLU",
  "RMSNorm",
  "LayerNorm",
  "GroupNorm",
  "RoPE",
  "YaRN",
  "Mamba",
  "Mamba2",
  "ConvNeXtV2",
  "ResNet",
  "Whisper",
  "Hyena",
  "Conformer",
]
const CASED = new Map(CASED_TOKENS.map((token) => [token.toLowerCase(), token]))

/**
 * Humanize an imported operation identifier: `004_fused_add_rmsnorm_h2048`
 * becomes "Fused add RMSNorm h2048". Curated titles (anything already
 * containing a space) pass through untouched; unknown tokens stay lowercase
 * rather than guessing a casing.
 */
export function humanizeOperationName(raw: string): string {
  if (raw.includes(" ")) return raw
  const words = raw
    .replace(/^\d+_/, "")
    .split("_")
    .filter(Boolean)
    .map((word) => CASED.get(word) ?? word)
  if (words.length === 0) return raw
  if (words[0] === words[0].toLowerCase())
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1)
  return words.join(" ")
}

const kebabish = (text: string) => text.toLowerCase().replaceAll(/[_\s]+/g, "-")

/**
 * Display name for an implementation from its manifest title, dropping the
 * segment that repeats the operation (importer titles are
 * "author · op_name" or "board · submission N"); the operation is always
 * named beside the row. Falls back to the slug when nothing informative
 * remains. Never re-cases what survives — author handles keep their casing.
 */
export function implementationDisplayName(
  title: string | null | undefined,
  operation: { name: string; slug: string },
  slug: string,
): string {
  if (!title) return slug
  const operationKey = kebabish(operation.name)
  const kept = title.split(" · ").filter((segment) => {
    const key = kebabish(segment.trim())
    if (key === "" || key === operationKey) return false
    return key.length < 4 || !operation.slug.includes(key)
  })
  return kept.length > 0 ? kept.join(" · ") : slug
}
