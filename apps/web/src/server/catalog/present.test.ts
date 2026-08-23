// Trust surfaces never disagree (§11.4): a label that speaks for a revision
// takes its strongest run, so it can never rank below one of its own rows.
import { describe, expect, it } from "vitest"
import { bestEvidence, type RunEvidenceInput, recordSequence } from "./present"

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

describe("recordSequence", () => {
  const values = (rows: { v: number | null }[]) => rows.map((row) => row.v)
  const replay = (v: (number | null)[]) =>
    values(
      recordSequence(
        v.map((value) => ({ v: value })),
        (row) => row.v,
      ),
    )

  it("drops events a later-arriving run invalidated", () => {
    // A run observed before the others but published later re-opens the
    // cohort at 90, which retires the 100 and 98.4 events that record_events
    // still holds. Without the replay, 98.4 reads as the current record and
    // the step to 100 renders as a −11.1% "improvement".
    expect(replay([90, 100, 98.4])).toEqual([90])
    expect(replay([120, 100, 98.4])).toEqual([120, 100, 98.4])
  })

  it("leaves the sequence improving at every step, holder last", () => {
    const sequence = replay([120, 130, 100, 100, 98.4, 107.1])
    expect(sequence).toEqual([120, 100, 98.4])
    expect(sequence.at(-1)).toBe(Math.min(...sequence.map(Number)))
  })

  it("skips unmeasured rows and holds nothing when none rank", () => {
    expect(replay([null, 120, null, 90])).toEqual([120, 90])
    expect(replay([null, null])).toEqual([])
  })
})
