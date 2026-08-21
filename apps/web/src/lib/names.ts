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
  // A segment repeats the operation when it contains the operation's name
  // or slug, or when it IS the slug minus a source prefix (board names like
  // "amd-fp8-mm" under "gpumode-amd-fp8-mm"). A segment that merely shares
  // the slug's prefix ("Liger fused" under "liger-fused-add-rms-norm") is
  // the implementation's identity and stays.
  const operationKeys = [kebabish(operation.name), operation.slug]
  const kept = title.split(" · ").filter((segment) => {
    const key = kebabish(segment.trim())
    if (key === "") return false
    if (operation.slug.endsWith(`-${key}`)) return false
    return !operationKeys.some(
      (opKey) => key === opKey || (opKey.length >= 6 && key.includes(opKey)),
    )
  })
  return kept.length > 0 ? kept.join(" · ") : slug
}

/** Model tags in an exact hyphen-boundary prefix relation with the slug —
 * the only cross-tag association the model surface makes (§16.21); fuzzy
 * grouping of variants would manufacture equivalence (§2.2). */
export function relatedModelTags(slug: string, tags: string[]): string[] {
  return tags
    .filter(
      (tag) =>
        tag !== slug &&
        (tag.startsWith(`${slug}-`) || slug.startsWith(`${tag}-`)),
    )
    .sort()
}

/** URL slug for a GPU model name: "NVIDIA B200 SXM" → "nvidia-b200-sxm". */
export function hardwareSlug(model: string): string {
  return model
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
}
