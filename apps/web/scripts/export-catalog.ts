// Versioned immutable catalog export (§13.2, §19.11): every canonical
// public object as JSONL, Zstandard-compressed, written into
// registry/exports/ with a `latest.json` pointer the API redirects to.
// Artifact bodies and snapshot payloads stay out — they are fetchable
// through the API and would swell the snapshot; digests are included.
import { createHash } from "node:crypto"
import {
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { compress } from "@mongodb-js/zstd"
import { isNotNull } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/server/db/schema.ts"

const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL to export the catalog.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })

const lines: string[] = []
const emit = (table: string, rows: unknown[]) => {
  for (const row of rows) lines.push(JSON.stringify({ table, row }))
  console.error(`${table}: ${rows.length}`)
}

try {
  emit("sources", await database.select().from(schema.sources))
  emit("projects", await database.select().from(schema.projects))
  emit("operations", await database.select().from(schema.operations))
  emit(
    "operation_aliases",
    await database.select().from(schema.operationAliases),
  )
  emit("workloads", await database.select().from(schema.workloads))
  emit("implementations", await database.select().from(schema.implementations))
  emit(
    "benchmark_runs",
    await database
      .select()
      .from(schema.benchmarkRuns)
      .where(isNotNull(schema.benchmarkRuns.publishedAt)),
  )
  emit("measurements", await database.select().from(schema.measurements))
  emit("record_events", await database.select().from(schema.recordEvents))
  emit(
    "artifacts",
    (await database.select().from(schema.artifacts)).map(
      ({ content, ...rest }) => rest,
    ),
  )
  // Serving catalog (§10.1 Week 9): dedicated tables, same export.
  emit("model_revisions", await database.select().from(schema.modelRevisions))
  emit(
    "serving_stack_revisions",
    await database.select().from(schema.servingStackRevisions),
  )
  emit(
    "serving_configurations",
    await database.select().from(schema.servingConfigurations),
  )
  emit(
    "serving_workloads",
    await database.select().from(schema.servingWorkloads),
  )
  emit(
    "serving_runs",
    await database
      .select()
      .from(schema.servingRuns)
      .where(isNotNull(schema.servingRuns.publishedAt)),
  )
  emit(
    "serving_measurements",
    await database.select().from(schema.servingMeasurements),
  )

  const body = Buffer.from(`${lines.join("\n")}\n`)
  const compressed = await compress(body, 19)
  const digest = createHash("sha256").update(compressed).digest("hex")
  const stamp = new Date().toISOString().slice(0, 10)
  const name = `catalog-${stamp}-${digest.slice(0, 8)}.jsonl.zst`
  const exportsDir = path.resolve(
    import.meta.dirname,
    "../../../registry/exports",
  )
  mkdirSync(exportsDir, { recursive: true })
  writeFileSync(path.join(exportsDir, name), compressed)
  writeFileSync(
    path.join(exportsDir, "latest.json"),
    `${JSON.stringify(
      {
        file: name,
        url: `https://raw.githubusercontent.com/SamMausberg/KernelIndex/main/registry/exports/${name}`,
        sha256: digest,
        sizeBytes: compressed.length,
        lines: lines.length,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  )
  // Retention: keep the newest three snapshots so the repo stays small;
  // git history preserves anything older.
  const KEEP = 3
  const stale = readdirSync(exportsDir)
    .filter(
      (file) => file.startsWith("catalog-") && file.endsWith(".jsonl.zst"),
    )
    .map((file) => ({
      file,
      mtime: statSync(path.join(exportsDir, file)).mtimeMs,
    }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(KEEP)
  for (const entry of stale) unlinkSync(path.join(exportsDir, entry.file))
  console.log(
    `${name} · ${lines.length} objects · ${compressed.length} bytes` +
      (stale.length > 0 ? ` · pruned ${stale.length} old snapshot(s)` : ""),
  )
} finally {
  await client.end()
}
