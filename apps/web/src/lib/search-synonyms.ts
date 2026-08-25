// Curated vocabulary bridges (§16.6): common ways people name an operation
// mapped to the corpus's canonical tokens. Applied as ALTERNATES beside what
// the user typed, never replacing it — recognition over recall, without
// guessing. Keep this table small and mechanical; every entry should be an
// uncontroversial rename of the same computation.
const SYNONYMS: [phrase: string, tokens: string[]][] = [
  ["matrix multiplication", ["matmul", "gemm", "mm"]],
  ["matrix multiply", ["matmul", "gemm", "mm"]],
  ["matmul", ["gemm", "mm"]],
  ["gemm", ["matmul"]],
  ["layer normalization", ["layernorm"]],
  ["rms normalization", ["rmsnorm"]],
  ["rms norm", ["rmsnorm"]],
  ["group normalization", ["groupnorm"]],
  ["normalization", ["norm"]],
  ["convolution", ["conv"]],
]

/** Canonical tokens the term sequence implies, beyond the terms themselves.
 * Longest matching phrase wins per position; no match returns []. */
export function synonymTokens(terms: string[]): string[] {
  const text = terms.join(" ").toLowerCase()
  const extra = new Set<string>()
  for (const [phrase, tokens] of SYNONYMS) {
    if (text === phrase || text.includes(phrase))
      for (const token of tokens) if (!terms.includes(token)) extra.add(token)
  }
  return [...extra]
}

/** Alternate whole term-lists for all-terms-must-match matchers (suggest):
 * the original list stays first; each synonym expansion substitutes its
 * phrase so "matrix multiplication" also tries ["matmul"], ["gemm"], … */
export function synonymTermSets(terms: string[]): string[][] {
  const text = terms.join(" ").toLowerCase()
  const sets: string[][] = []
  for (const [phrase, tokens] of SYNONYMS) {
    if (!text.includes(phrase)) continue
    for (const token of tokens) {
      const replaced = text.replace(phrase, token).split(" ").filter(Boolean)
      sets.push(replaced)
    }
  }
  return sets
}
