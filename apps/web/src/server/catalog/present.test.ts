// Trust surfaces never disagree (§11.4): a label that speaks for a revision
// takes its strongest run, so it can never rank below one of its own rows.
import { describe, expect, it } from "vitest"
import { bestEvidence, type RunEvidenceInput } from "./present"

const run = (overrides: Partial<RunEvidenceInput>): RunEvidenceInput => ({
  reproducedByKernelindex: false,
  independentReplicationCount: 0,
  sourceAvailable: false,
  installable: false,
  hasRawEvidence: false,
  ...overrides,
})

describe("bestEvidence", () => {
  it("takes the strongest run, not the first", () => {
    expect(
      bestEvidence([
        run({}),
        run({ sourceAvailable: true, hasRawEvidence: true }),
        run({}),
      ]),
    ).toBe("reproducible")
    expect(
      bestEvidence([
        run({ sourceAvailable: true, hasRawEvidence: true }),
        run({ reproducedByKernelindex: true }),
      ]),
    ).toBe("verified")
  })

  it("is null with no runs and reported at the floor", () => {
    expect(bestEvidence([])).toBeNull()
    expect(bestEvidence([run({})])).toBe("reported")
  })
})
