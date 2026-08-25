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
import { isUsable } from "../../features/answer/answer-slots.tsx"
import { getImplementationPage } from "./implementation-reads.ts"
import { getRunPage } from "./run-page-reads.ts"
import { searchCatalog } from "./search-reads.ts"

/** Query, expected winner, and the rival it has to beat outright. The
 * install line must pin to a measured release (§8.15): the row pins to its
 * own run's version, the page to the newest measured one — both match this
 * pattern, and an unpinned `pip install liger-kernel` fails the path. */
const PATHS = [
  {
    name: "rmsnorm on A100",
    query: "rms norm gpu:A100 dtype:bf16",
    implementation: "liger-bench-rms-norm-liger",
    project: "liger-kernel",
    install: /^pip install "liger-kernel==\d[\w.]*"$/,
    license: "BSD-2-Clause",
  },
  {
    name: "KL divergence on H100",
    query: "liger-kl-div gpu:H100 dtype:fp32",
    implementation: "liger-bench-kl-div-liger",
    project: "liger-kernel",
    install: /^pip install "liger-kernel==\d[\w.]*"$/,
    license: "BSD-2-Clause",
  },
  {
    name: "JSD on B200",
    query: "liger-jsd gpu:B200",
    implementation: "liger-bench-jsd-liger",
    project: "liger-kernel",
    install: /^pip install "liger-kernel==\d[\w.]*"$/,
    license: "BSD-2-Clause",
  },
] as const

const url = process.env.DATABASE_URL

// The paths walk the real imported corpus. A database that has never run
// the Liger import — CI's migrated-but-empty service, a fresh compose — has
// nothing to walk; skipping there keeps the suite honest without failing on
// absence. Any database holding the corpus still runs every assertion.
const seeded = url
  ? await getImplementationPage(PATHS[0].implementation)
      .then((page) => page !== null)
      .catch(() => false)
  : false

describe.skipIf(!seeded)("golden paths (database)", () => {
  for (const path of PATHS) {
    it(`${path.name}: query resolves to one installable, licensed, sourced winner`, async () => {
      // 1. The query answers with a winner, not a list to sift.
      const model = await searchCatalog({ query: path.query })
      const [winner, runnerUp] = model.groups.exact
      expect(winner, `no exact match for "${path.query}"`).toBeDefined()
      expect(winner.implementation.slug).toBe(path.implementation)
      expect(winner.project.slug).toBe(path.project)

      // 2. Unambiguous: the runner-up is a different project and loses by a
      //    margin no measurement noise explains, so the answer never rests on
      //    a near-tie a reader would have to arbitrate.
      expect(
        runnerUp,
        "a winner needs something to have won against",
      ).toBeDefined()
      expect(runnerUp.project.slug).not.toBe(winner.project.slug)
      expect(winner.primary?.value).toBeGreaterThan(0)
      expect(runnerUp.primary?.value).toBeGreaterThan(
        (winner.primary?.value ?? 0) * 2,
      )
      expect(winner.tiedWithPrevious).toBe(false)

      // 3. The row offers a pinned install line and passes the policy.
      expect(isUsable(winner)).toBe(true)
      expect(winner.install?.command).toMatch(path.install)
      expect(winner.install?.pinned).toBe(true)
      expect(winner.license.concluded).toBe(path.license)

      // 4. The implementation page agrees with the row it came from. These
      //    two derived the install line separately once, and disagreed.
      const page = await getImplementationPage(path.implementation)
      expect(page).not.toBeNull()
      expect(page?.usage.install?.command).toMatch(path.install)
      expect(page?.usage.install?.pinned).toBe(true)
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
