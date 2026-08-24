// Golden paths (§2.1): the whole promise, walked end to end on real data —
// an exact query returns one unambiguous winner, that winner can actually be
// installed under a license you can read, and its number carries provenance
// back to the snapshot it was imported from. Every link is asserted through
// the same reads the pages use, so a break anywhere shows up here first.
//
// These guard a real regression: the implementation page once denied an
// install recipe that the result row beside it was already printing, because
// the two sides derived the command differently.
import { describe, expect, it } from "vitest"
import { isDeployable } from "../../features/answer/answer-slots.tsx"
import { getImplementationPage } from "./implementation-reads.ts"
import { getRunPage } from "./run-page-reads.ts"
import { searchCatalog } from "./search-reads.ts"

/**
 * Query, expected winner, and the rival it has to beat outright. Each query
 * names its operation unambiguously: the bare word "rmsnorm" still resolves
 * to the seeded illustrative operation, which owns that alias.
 */
const PATHS = [
  {
    name: "rmsnorm on A100",
    query: "liger-rms-norm gpu:A100 dtype:bf16",
    implementation: "liger-bench-rms-norm-liger",
    project: "liger-kernel",
    install: "pip install liger-kernel",
    license: "BSD-2-Clause",
  },
  {
    name: "fused MoE on H100",
    query: "fused moe gpu:H100",
    implementation: "liger-bench-fused-moe-liger",
    project: "liger-kernel",
    install: "pip install liger-kernel",
    license: "BSD-2-Clause",
  },
  {
    name: "group norm on B200",
    query: "group norm gpu:B200 dtype:fp32",
    implementation: "liger-bench-group-norm-liger",
    project: "liger-kernel",
    install: "pip install liger-kernel",
    license: "BSD-2-Clause",
  },
] as const

const url = process.env.DATABASE_URL

describe.skipIf(!url)("golden paths (database)", () => {
  for (const path of PATHS) {
    it(`${path.name}: query resolves to one installable, licensed, sourced winner`, async () => {
      // 1. The query answers with a winner, not a list to sift.
      const model = await searchCatalog({ query: path.query })
      const [winner, runnerUp] = model.groups.exact
      expect(winner, `no exact match for "${path.query}"`).toBeDefined()
      expect(winner.implementation.slug).toBe(path.implementation)
      expect(winner.project.slug).toBe(path.project)

      // 2. Unambiguous: it beats the next row outright rather than resting on
      //    a statistical tie, and the cohort holds a rival from another
      //    project, so the comparison means something.
      expect(
        runnerUp,
        "a winner needs something to have won against",
      ).toBeDefined()
      expect(winner.primary?.value).toBeGreaterThan(0)
      expect(runnerUp.primary?.value).toBeGreaterThan(
        (winner.primary?.value ?? 0) * 1.05,
      )
      expect(winner.tiedWithPrevious).toBe(false)
      expect(
        model.groups.exact.some(
          (row) => row.project.slug !== winner.project.slug,
        ),
        "the cohort has no rival project to compare against",
      ).toBe(true)

      // 3. The row offers a real install line and passes the policy.
      expect(isDeployable(winner)).toBe(true)
      expect(winner.install?.command).toBe(path.install)
      expect(winner.license.concluded).toBe(path.license)

      // 4. The implementation page agrees with the row it came from. These
      //    two derived the install line separately once, and disagreed.
      const page = await getImplementationPage(path.implementation)
      expect(page).not.toBeNull()
      expect(page?.usage.install?.command).toBe(path.install)
      expect(page?.license.concluded).toBe(path.license)
      expect(page?.source.available).toBe(true)

      // 5. The number is traceable back to what produced it: a named source
      //    with its terms, the source's own identifier for the measurement,
      //    and the protocol and environment it was taken under.
      expect(winner.runId).not.toBeNull()
      const run = await getRunPage(winner.runId as string)
      expect(run).not.toBeNull()
      expect(run?.protocol.length).toBeGreaterThan(0)
      expect(run?.environment.length).toBeGreaterThan(0)
      expect(run?.provenance.source.license).toBe(path.license)
      expect(run?.provenance.externalId).toBeTruthy()
    })
  }
})
