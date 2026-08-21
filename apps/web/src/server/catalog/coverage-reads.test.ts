// The public-count invariant (§11.4): every surface that states a run count
// derives it from the same eligibility predicate, so numbers can never
// disagree between pages. Requires DATABASE_URL (migrated database); holds
// for any corpus, so the shared dev database is fine.
import { describe, expect, it } from "vitest"
import { getCoveragePage } from "./coverage-reads.ts"
import { getHomePage } from "./reads.ts"

describe.skipIf(!process.env.DATABASE_URL)("coverage counts", () => {
  it("per-source eligible runs sum to the homepage stat", async () => {
    const [coverage, home] = await Promise.all([
      getCoveragePage(),
      getHomePage(),
    ])
    const kernel = coverage.sources.filter((s) => s.kind === "kernel")
    const eligible = kernel.reduce((n, s) => n + s.runs, 0)
    expect(eligible).toBe(home.stats.runs)
  })

  it("the indexed corpus is never smaller than the eligible one", async () => {
    const coverage = await getCoveragePage()
    for (const source of coverage.sources) {
      expect(source.indexed).toBeGreaterThanOrEqual(source.runs)
    }
  })

  it("hero cells count eligible runs only", async () => {
    const coverage = await getCoveragePage()
    const heroTotal = coverage.hero.rows.reduce((n, row) => n + row.total, 0)
    const eligible = coverage.sources
      .filter((s) => s.kind === "kernel")
      .reduce((n, s) => n + s.runs, 0)
    expect(heroTotal).toBeLessThanOrEqual(eligible)
  })
})
