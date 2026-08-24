// Cohort selection (§14.4). A leaderboard's value is not its longest run of
// submissions but the spread of people who beat each other on it, so a cohort
// (board × runner) contributes every distinct author's personal best, plus a
// capped, evenly-spaced walk of each author's own improving chain — the "how
// the record fell" evidence. Pure and shared: discovery selects before it
// hydrates, so the bulky columns are only ever fetched for kept rows.
import type { GmCandidate } from "./types.ts"

export type GmSelectionOptions = {
  /** Distinct authors kept per cohort; null keeps every author. */
  top: number | null
  /** Authors whose progression chain is kept; null keeps every author's. */
  authors: number | null
  /** Progression steps kept per author (evenly spaced, first and best). */
  maxPerAuthor: number
}

export type GmCohortSelection = {
  runner: string
  /** Best score first: personal bests in rank order, then progression. */
  selected: GmCandidate[]
  /** Distinct authors whose personal best was kept. */
  top: number
  /** Additional progression steps kept beyond those personal bests. */
  progression: number
  /** Candidates rejected because their evidence would not parse. */
  invalid: number
}

/** Keep at most `max` entries, always including the first and the last. */
export function evenlySpaced<T>(list: T[], max: number): T[] {
  if (list.length <= max) return list
  const out: T[] = []
  for (let index = 0; index < max; index++) {
    out.push(list[Math.round((index * (list.length - 1)) / (max - 1))])
  }
  return [...new Set(out)]
}

/**
 * One cohort's selection: each distinct author's best submission in rank
 * order, then each author's strictly-improving chain, capped and deduplicated
 * by submission. `ranked` is best-first; `history` returns one author's
 * submissions in time order.
 */
export function selectCohort(input: {
  ranked: GmCandidate[]
  history: (userId: string) => GmCandidate[]
  runner: string
  options: GmSelectionOptions
  valid: (candidate: GmCandidate) => boolean
}): GmCohortSelection {
  const { ranked, history, runner, options, valid } = input
  const bestByUser: GmCandidate[] = []
  const seenUsers = new Set<string>()
  let invalid = 0
  for (const candidate of ranked) {
    if (seenUsers.has(candidate.userId)) continue
    if (!valid(candidate)) {
      invalid++
      continue
    }
    seenUsers.add(candidate.userId)
    bestByUser.push(candidate)
    if (options.top !== null && bestByUser.length >= options.top) break
  }

  const selected = new Map<number, GmCandidate>()
  for (const candidate of bestByUser) {
    selected.set(candidate.submissionId, candidate)
  }

  let progression = 0
  const chained =
    options.authors === null ? bestByUser : bestByUser.slice(0, options.authors)
  for (const leader of chained) {
    let best = Number.POSITIVE_INFINITY
    const chain: GmCandidate[] = []
    for (const candidate of history(leader.userId)) {
      if (!valid(candidate) || candidate.score >= best) continue
      best = candidate.score
      chain.push(candidate)
    }
    // A truncated history may not reach the author's known best; the chain
    // must still end there so the cohort's record story is complete.
    if (leader.score < best) chain.push(leader)
    for (const candidate of evenlySpaced(chain, options.maxPerAuthor)) {
      if (!selected.has(candidate.submissionId)) {
        selected.set(candidate.submissionId, candidate)
        progression++
      }
    }
  }

  return {
    runner,
    selected: [...selected.values()].sort((a, b) => a.score - b.score),
    top: bestByUser.length,
    progression,
    invalid,
  }
}
