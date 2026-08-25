// Suggestion matching over the inline operation index (§16.6). Pure and
// shared with tests; the combobox feeds it the parsed query so
// `gemm b200 bf16` still suggests GEMM operations.
import type { OperationIndexEntry } from "./catalog-models"
import type { parseQuery } from "./search-query"
import { synonymTermSets } from "./search-synonyms"

const LIMIT = 10

/**
 * Suggestions for a parsed query. Bare recognized tokens ("fp8", "b200")
 * are consumed into facets by the parser, but while typing they are also
 * name material: the strict pass includes them as terms so "fp8" surfaces
 * the FP8 operations; when nothing matches (a pure facet like "b200"
 * beside "gemm"), the free-text terms alone decide, preserving the
 * `gemm b200 bf16` behavior.
 */
export function suggestFor(
  intent: ReturnType<typeof parseQuery>,
  index: OperationIndexEntry[],
): OperationIndexEntry[] {
  // An op:<slug> facet is already a resolved selection.
  if (intent.facets.some((facet) => facet.field === "op")) return []
  const bare = intent.facets
    .map((facet) => facet.token.toLowerCase())
    .filter((token) => !/[:=]/.test(token))
  const strict =
    bare.length > 0 ? matchSuggestions([...intent.text, ...bare], index) : []
  return strict.length > 0 ? strict : matchSuggestions(intent.text, index)
}

/**
 * Rank index entries against free-text terms: whole-phrase name prefix beats
 * per-term word prefixes beats substring coverage (name, slug, or family).
 * Ties break by run count, then name.
 */
export function matchSuggestions(
  terms: string[],
  index: OperationIndexEntry[],
): OperationIndexEntry[] {
  const lowered = terms.map((term) => term.toLowerCase()).filter(Boolean)
  if (lowered.length === 0) return []
  // Vocabulary bridges: "matrix multiplication" also tries the corpus's
  // own tokens (matmul, gemm, mm), merged after direct matches.
  const alternates = synonymTermSets(lowered)
  if (alternates.length > 0) {
    const seen = new Set<string>()
    const merged: OperationIndexEntry[] = []
    for (const set of [lowered, ...alternates]) {
      for (const entry of rankSuggestions(set, index)) {
        if (seen.has(entry.slug)) continue
        seen.add(entry.slug)
        merged.push(entry)
      }
    }
    return merged.slice(0, LIMIT)
  }
  return rankSuggestions(lowered, index)
}

function rankSuggestions(
  lowered: string[],
  index: OperationIndexEntry[],
): OperationIndexEntry[] {
  const phrase = lowered.join(" ")
  return index
    .map((entry) => {
      const name = entry.name.toLowerCase()
      const words = name.split(/[^a-z0-9]+/)
      const tier = name.startsWith(phrase)
        ? 4
        : lowered.every((term) => words.some((word) => word.startsWith(term)))
          ? 3
          : name.includes(phrase) ||
              entry.aliases.some((alias) => alias.includes(phrase))
            ? 2
            : lowered.every(
                  (term) =>
                    name.includes(term) ||
                    entry.slug.includes(term) ||
                    entry.family.includes(term) ||
                    entry.aliases.some((alias) => alias.includes(term)),
                )
              ? 1
              : 0
      return { entry, tier }
    })
    .filter((scored) => scored.tier > 0)
    .sort(
      (a, b) =>
        b.tier - a.tier ||
        b.entry.runs - a.entry.runs ||
        a.entry.name.localeCompare(b.entry.name),
    )
    .slice(0, LIMIT)
    .map((scored) => scored.entry)
}
