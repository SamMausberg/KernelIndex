// Suggestion matching over the inline operation index (§16.6). Pure and
// shared with tests; the combobox feeds it the free-text terms left after
// facet parsing so `gemm b200 bf16` still suggests GEMM operations.
import type { OperationIndexEntry } from "./catalog-models"

const LIMIT = 8

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
