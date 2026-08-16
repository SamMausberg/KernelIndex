#!/usr/bin/env node
// ki — the KernelIndex CLI (§13.8). Human-readable tables by default; the
// --json/--jsonl output is stable machine output with no decorative noise,
// full units, and untruncated digests. Exit codes: 0 ok, 1 error, 2 usage.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import { parse as parseYaml } from "yaml"
import { client, type ResolveEnvelope } from "./client.ts"
import { digestManifest, validateManifest } from "./manifest.ts"

const HELP = `ki — KernelIndex command line

Usage:
  ki search <query…>                 resolver decision for a text query
  ki resolve kernel --manifest <p>   resolver decision for a structured request
  ki show <operation|implementation|run> <id-or-slug>
  ki compare run <id> <id> [...]     aligned comparison (2–8 runs)
  ki manifest validate <path>        validate a manifest against its schema
  ki manifest digest <path>          canonical RFC 8785 spec digest

Flags:
  --api <url>    API base (default $KI_API or https://kernelindex.com/api/v1)
  --json         machine JSON on stdout
  --jsonl        one JSON line per result row
  --quiet        suppress human headers
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    api: { type: "string" },
    manifest: { type: "string" },
    json: { type: "boolean", default: false },
    jsonl: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
})

function usage(message?: string): never {
  if (message) console.error(message)
  console.error(HELP)
  process.exit(2)
}

if (values.help || positionals.length === 0) usage()

const api = client(
  values.api ?? process.env.KI_API ?? "https://kernelindex.com/api/v1",
)

/** Machine output: exactly one JSON document (or JSONL rows), nothing else. */
function emit(document: unknown, rows?: unknown[]) {
  if (values.jsonl && rows) {
    for (const row of rows) console.log(JSON.stringify(row))
    return true
  }
  if (values.json || values.jsonl) {
    console.log(JSON.stringify(document, null, 2))
    return true
  }
  return false
}

const NS = [
  { limit: 1e3, divisor: 1, unit: "ns" },
  { limit: 1e6, divisor: 1e3, unit: "µs" },
  { limit: 1e9, divisor: 1e6, unit: "ms" },
  { limit: Number.POSITIVE_INFINITY, divisor: 1e9, unit: "s" },
]
function formatPrimary(
  primary: { value: number; unit: string } | null,
): string {
  if (!primary) return "—"
  const ns =
    primary.unit === "ns"
      ? primary.value
      : primary.unit === "s"
        ? primary.value * 1e9
        : null
  if (ns === null) return `${primary.value} ${primary.unit}`
  const scale = NS.find((s) => ns < s.limit) ?? NS[3]
  const value = ns / scale.divisor
  return `${value.toFixed(value < 10 && scale.unit !== "ns" ? 2 : 0)} ${scale.unit}`
}

function table(rows: string[][]) {
  if (rows.length === 0) return
  const widths = rows[0].map((_, column) =>
    Math.max(...rows.map((row) => row[column].length)),
  )
  for (const row of rows) {
    console.log(
      row
        .map((cell, index) => cell.padEnd(widths[index]))
        .join("  ")
        .trimEnd(),
    )
  }
}

function printEnvelope(envelope: ResolveEnvelope) {
  if (!values.quiet) {
    console.log(`${envelope.interpretation} · ${envelope.policyVersion}`)
    if (envelope.cohort) console.log(envelope.cohort.description)
  }
  if (envelope.mode === "chooser") {
    table(
      (envelope.matches ?? []).map((match) => [
        match.slug,
        match.name,
        `${match.runs} runs`,
      ]),
    )
    return
  }
  const rows = envelope.groups.exact.map((row) => [
    row.rank === null ? "—" : String(row.rank),
    row.implementation.name,
    row.project.name,
    formatPrimary(row.primary),
    row.evidence ?? "no evidence",
    row.hardware.model,
  ])
  table([
    ["#", "implementation", "project", "latency", "evidence", "hardware"],
    ...rows,
  ])
  if (envelope.compatibleOverflow > 0 && !values.quiet) {
    console.log(`${envelope.compatibleOverflow} compatible rows not shown`)
  }
}

async function main(): Promise<number> {
  const [command, ...rest] = positionals

  if (command === "search") {
    if (rest.length === 0) usage("search needs a query")
    const envelope = await api.search(rest.join(" "))
    if (emit(envelope, envelope.groups.exact)) return 0
    printEnvelope(envelope)
    return 0
  }

  if (command === "resolve") {
    if (rest[0] !== "kernel" || !values.manifest)
      usage("usage: ki resolve kernel --manifest <path>")
    const request = readManifestFile(values.manifest)
    const envelope = await api.resolveKernel(request)
    if (emit(envelope, envelope.groups.exact)) return 0
    printEnvelope(envelope)
    return 0
  }

  if (command === "show") {
    const [kind, id] = rest
    if (!id || !["operation", "implementation", "run"].includes(kind))
      usage("usage: ki show <operation|implementation|run> <id>")
    const dossier = await api.show(kind, id)
    console.log(JSON.stringify(dossier, null, 2))
    return 0
  }

  if (command === "compare") {
    if (rest[0] !== "run" || rest.length < 3)
      usage("usage: ki compare run <id> <id> [...]")
    const model = await api.compare(rest.slice(1))
    if (emit(model)) return 0
    console.log(model.explanation)
    table(
      model.runs.map((entry) => {
        const run = entry as {
          rank: number | null
          implementation: { name: string }
          primary: { value: number; unit: string } | null
          evidence: string | null
          hardware: string
        }
        return [
          run.rank === null ? "—" : String(run.rank),
          run.implementation.name,
          formatPrimary(run.primary),
          run.evidence ?? "no evidence",
          run.hardware,
        ]
      }),
    )
    return 0
  }

  if (command === "manifest") {
    const [action, file] = rest
    if (!file) usage("usage: ki manifest <validate|digest> <path>")
    if (action === "validate") {
      const result = validateManifest(file)
      if (emit(result)) return result.valid ? 0 : 1
      if (result.valid) {
        // Schema-level: canonical refinements (e.g. integer-nanosecond
        // durations) run in the publication transaction, not here.
        if (!values.quiet) console.log(`valid ${result.kind} · schema level`)
        return 0
      }
      for (const error of result.errors) console.error(error)
      return 1
    }
    if (action === "digest") {
      const digest = digestManifest(file)
      if (emit(digest)) return 0
      console.log(digest.specDigest)
      return 0
    }
    usage(`unknown manifest action '${action}'`)
  }

  usage(`unknown command '${command}'`)
}

function readManifestFile(file: string): unknown {
  const text = readFileSync(file, "utf8")
  return file.endsWith(".json") ? JSON.parse(text) : parseYaml(text)
}

try {
  process.exit(await main())
} catch (error) {
  console.error((error as Error).message)
  process.exit(1)
}
