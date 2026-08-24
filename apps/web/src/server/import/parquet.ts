// Column-oriented source reads (§14.3, §14.9). A leaderboard dataset's bulk is
// mirrored submission source: on GPU MODE's largest config the code column is
// 99.7% of 2.2 GB, while every fact an importer ranks on — author, board,
// runner, score, time — is 6 MB. Reading the file's columns over byte ranges
// takes the second number instead of the first, so discovery can see a whole
// population rather than a paged slice of it.
//
// Identity (§14.3): the digested snapshot is the parquet *footer*, which
// carries the schema plus every row group and column chunk offset — no two
// files share one. The locator is always a revision-pinned URL, so the footer
// digest and the bytes it describes are immutable together.

import type { AsyncBuffer, FileMetaData } from "hyparquet"
import { parquetMetadataAsync, parquetReadObjects } from "hyparquet"
import { sha256Digest } from "../identity/digest.ts"
import { type FetchedSnapshot, fetchRange, fetchSize } from "./fetch.ts"

/** `<footer length:4><"PAR1">` closes every parquet file. */
const TRAILER_BYTES = 8

export type ParquetHandle = {
  locator: string
  metadata: FileMetaData
  file: AsyncBuffer
  /** Digest of the footer; the file's identity in source_snapshots. */
  snapshot: FetchedSnapshot
  /** Column paths present in the file, dotted for struct children. */
  columns: string[]
  rowCount: number
}

/** Open a revision-pinned parquet file and snapshot its footer. */
export async function openParquet(locator: string): Promise<ParquetHandle> {
  const byteLength = await fetchSize(locator)
  const trailer = await fetchRange(
    locator,
    byteLength - TRAILER_BYTES,
    byteLength,
  )
  const view = new DataView(
    trailer.buffer,
    trailer.byteOffset,
    trailer.byteLength,
  )
  const footerLength = view.getUint32(0, true)
  const footerStart = byteLength - footerLength - TRAILER_BYTES
  if (footerStart < 4) throw new Error(`${locator} is not a parquet file`)
  const footer = await fetchRange(locator, footerStart, byteLength)

  // Serve the cached footer locally; everything else is a fresh range read.
  const file: AsyncBuffer = {
    byteLength,
    async slice(start, end) {
      const stop = end ?? byteLength
      if (start >= footerStart) {
        const from = start - footerStart
        return footer.buffer.slice(
          footer.byteOffset + from,
          footer.byteOffset + (stop - footerStart),
        ) as ArrayBuffer
      }
      const bytes = await fetchRange(locator, start, stop)
      return bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      ) as ArrayBuffer
    },
  }
  const metadata = await parquetMetadataAsync(file)
  const fetchedAt = new Date()
  return {
    locator,
    metadata,
    file,
    columns: columnPaths(metadata),
    rowCount: Number(metadata.num_rows),
    snapshot: {
      locator,
      resolvedLocator: locator,
      contentDigest: sha256Digest(footer),
      mediaType: "application/vnd.apache.parquet",
      // The footer names the file; its size is the file's, not the footer's.
      sizeBytes: byteLength,
      body: "",
      fetchedAt,
    },
  }
}

function columnPaths(metadata: FileMetaData): string[] {
  const paths = new Set<string>()
  for (const column of metadata.row_groups[0]?.columns ?? []) {
    const path = column.meta_data?.path_in_schema
    if (path && path.length > 0) paths.add(path[0])
  }
  return [...paths]
}

/**
 * Parquet-native values into the shapes the JSON parsers already expect:
 * int64 arrives as a bigint and a timestamp as a Date, and both must render
 * exactly as the same row did over the rows API or every derived digest moves.
 */
function plainValue(value: unknown): unknown {
  if (typeof value === "bigint") return Number(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(plainValue)
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, inner] of Object.entries(value)) {
      out[key] = plainValue(inner)
    }
    return out
  }
  return value
}

export type ParquetRow = Record<string, unknown>

/**
 * Stream the requested columns one row group at a time. Row groups bound the
 * working set: a caller reading a 231k-row column never holds more than one
 * group's values, and a caller that only wants identity columns never touches
 * the pages the rest of the file is made of.
 */
export async function* readParquetGroups(
  handle: ParquetHandle,
  columns: string[],
): AsyncGenerator<{ rows: ParquetRow[]; rowStart: number }> {
  const wanted = columns.filter((column) => handle.columns.includes(column))
  let rowStart = 0
  for (const group of handle.metadata.row_groups) {
    const rowEnd = rowStart + Number(group.num_rows)
    const rows = await parquetReadObjects({
      file: handle.file,
      metadata: handle.metadata,
      columns: wanted,
      rowStart,
      rowEnd,
    })
    yield { rows: rows.map((row) => plainValue(row) as ParquetRow), rowStart }
    rowStart = rowEnd
  }
}

/** Read the requested columns for one contiguous row window. */
export async function readParquetRows(
  handle: ParquetHandle,
  columns: string[],
  rowStart: number,
  rowEnd: number,
): Promise<ParquetRow[]> {
  const rows = await parquetReadObjects({
    file: handle.file,
    metadata: handle.metadata,
    columns: columns.filter((column) => handle.columns.includes(column)),
    rowStart,
    rowEnd,
  })
  return rows.map((row) => plainValue(row) as ParquetRow)
}
