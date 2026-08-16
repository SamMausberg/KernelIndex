// §16.18 budget gate: first-load JavaScript on ordinary catalog pages must
// stay under 150 KiB compressed. Measures brotli over each route's
// first-load chunks (what the CDN actually serves) from the build's
// diagnostics; fails CI on any offender. Run after `next build`.
import { readFileSync } from "node:fs"
import path from "node:path"
import { brotliCompressSync } from "node:zlib"

const BUDGET_BYTES = 150 * 1024
/** "Ordinary catalog pages" (§16.18); private/dev surfaces are exempt. */
const EXEMPT = [/^\/admin/, /^\/account/, /^\/submit/, /^\/dev\//, /^\/signin/]

const root = path.resolve(import.meta.dirname, "..")
const stats = JSON.parse(
  readFileSync(
    path.join(root, ".next/diagnostics/route-bundle-stats.json"),
    "utf8",
  ),
) as { route: string; firstLoadChunkPaths: string[] }[]

const compressed = new Map<string, number>()
const sizeOf = (chunk: string) => {
  let size = compressed.get(chunk)
  if (size === undefined) {
    size = brotliCompressSync(readFileSync(path.join(root, chunk))).byteLength
    compressed.set(chunk, size)
  }
  return size
}

let failed = false
for (const entry of stats) {
  if (EXEMPT.some((pattern) => pattern.test(entry.route))) continue
  const bytes = entry.firstLoadChunkPaths.reduce(
    (total, chunk) => total + sizeOf(chunk),
    0,
  )
  const kib = (bytes / 1024).toFixed(0)
  if (bytes > BUDGET_BYTES) {
    failed = true
    console.error(`OVER  ${entry.route}: ${kib} KiB br (budget 150 KiB)`)
  } else {
    console.log(`ok    ${entry.route}: ${kib} KiB br`)
  }
}
if (failed) process.exit(1)
console.log("bundle budget holds")
