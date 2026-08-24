// Column-oriented reads (§14.3, §14.9): the footer is the snapshot identity,
// row groups bound the working set, and parquet-native values must land in
// exactly the shapes the JSON parsers produce — an int64 as a number and a
// timestamp as the same millisecond-truncated instant — because every derived
// digest depends on it. The fetch layer is mocked over a committed fixture;
// no network.
import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const file = readFileSync(
  path.join(import.meta.dirname, "__fixtures__", "rows.parquet"),
)
const ranges: [number, number][] = []

vi.mock("./fetch.ts", () => ({
  fetchSize: async () => file.byteLength,
  fetchRange: async (_locator: string, start: number, end: number) => {
    ranges.push([start, end])
    return new Uint8Array(file.subarray(start, end))
  },
}))

const { openParquet, readParquetGroups, readParquetRows } = await import(
  "./parquet.ts"
)
const locator = "https://huggingface.co/datasets/x/resolve/abc/rows.parquet"

beforeEach(() => {
  ranges.length = 0
})

describe("parquet reads", () => {
  it("snapshots the footer, not the file, and reads it once", async () => {
    const handle = await openParquet(locator)
    expect(handle.snapshot.contentDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
    // The snapshot names the file: its size, its pinned locator, its footer.
    expect(handle.snapshot.sizeBytes).toBe(file.byteLength)
    expect(handle.snapshot.resolvedLocator).toBe(locator)
    expect(handle.rowCount).toBe(2)
    expect(handle.columns).toEqual([
      "submission_id",
      "user_id",
      "submission_time",
      "score",
      "passed",
      "code",
      "run_result",
    ])

    const again = await openParquet(locator)
    expect(again.snapshot.contentDigest).toBe(handle.snapshot.contentDigest)
  })

  it("normalizes int64, timestamps, and dotted struct children", async () => {
    const handle = await openParquet(locator)
    // A column this file does not carry is dropped, not guessed at.
    expect(await readParquetRows(handle, ["nope"], 0, 1)).toEqual([{}])

    const [first] = await readParquetRows(
      handle,
      ["submission_id", "user_id", "submission_time", "run_result"],
      0,
      1,
    )
    expect(first.submission_id).toBe(11)
    expect(typeof first.submission_id).toBe("number")
    expect(first.user_id).toBe("7")
    // 1773532572.645613s truncates to the same millisecond the rows API
    // renders, so observedAt — and every digest over it — is unchanged.
    expect(first.submission_time).toBe("2026-03-14T23:56:12.645Z")
    expect(first.run_result).toEqual({
      "benchmark-count": "2",
      "benchmark.0.mean": "1000",
      "benchmark.0.spec": "m: 4",
    })
  })

  it("streams row groups and never reads the columns it was not asked for", async () => {
    const handle = await openParquet(locator)
    const footerReads = ranges.length
    const groups = []
    for await (const group of readParquetGroups(handle, ["submission_id"])) {
      groups.push(group)
    }
    expect(groups.map((group) => group.rowStart)).toEqual([0, 1])
    expect(groups.flatMap((group) => group.rows)).toEqual([
      { submission_id: 11 },
      { submission_id: 22 },
    ])
    // One id column across two row groups is far less than the whole file.
    const read = ranges
      .slice(footerReads)
      .reduce((total, [start, end]) => total + (end - start), 0)
    expect(read).toBeLessThan(file.byteLength / 2)
  })
})
