import { describe, expect, it } from "vitest"
import { parseQuery } from "../../lib/search-query.ts"
import { type BracketCase, bracketCases, bracketQuery } from "./match.ts"

const CASES: BracketCase[] = [
  {
    id: "t1024",
    axes: { tokens: 1024, hidden: 4096 },
    shape: [1024, 4096],
    dtypes: ["bf16"],
  },
  {
    id: "t2048",
    axes: { tokens: 2048, hidden: 4096 },
    shape: [2048, 4096],
    dtypes: ["bf16"],
  },
  {
    id: "t4096",
    axes: { tokens: 4096, hidden: 4096 },
    shape: [4096, 4096],
    dtypes: ["bf16"],
  },
  {
    id: "t8192-fp8",
    axes: { tokens: 8192, hidden: 4096 },
    shape: [8192, 4096],
    dtypes: ["fp8"],
  },
]

describe("bracketCases", () => {
  it("brackets a bound axis between its measured neighbours", () => {
    const query = "rmsnorm B200 bf16 tokens=3000"
    const bracket = bracketCases(parseQuery(query), CASES)
    expect(bracket).toMatchObject({
      axis: "tokens",
      requested: 3000,
      below: { id: "t2048", value: 2048 },
      above: { id: "t4096", value: 4096 },
    })
    // The rewrite keeps every other facet and lands on the exact case.
    expect(
      bracketQuery(query, bracket as NonNullable<typeof bracket>, 2048),
    ).toBe("rmsnorm B200 bf16 tokens=2048")
  })

  it("keeps the dtype facet: an fp8-only case never brackets bf16", () => {
    const bracket = bracketCases(parseQuery("rmsnorm bf16 tokens=6000"), CASES)
    expect(bracket?.below?.id).toBe("t4096")
    expect(bracket?.above).toBeNull()
  })

  it("refuses when two bound axes differ", () => {
    expect(
      bracketCases(parseQuery("rmsnorm tokens=3000 hidden=8192"), CASES),
    ).toBeNull()
  })

  it("brackets a shape on its one differing dimension via the named axis", () => {
    const query = "rmsnorm [3000,4096]"
    const bracket = bracketCases(parseQuery(query), CASES)
    expect(bracket).toMatchObject({
      axis: "tokens",
      requested: 3000,
      below: { id: "t2048" },
      above: { id: "t4096" },
    })
    expect(
      bracketQuery(query, bracket as NonNullable<typeof bracket>, 4096),
    ).toBe("rmsnorm tokens=4096")
  })

  it("returns nothing without a case binding", () => {
    expect(bracketCases(parseQuery("rmsnorm B200"), CASES)).toBeNull()
  })
})
