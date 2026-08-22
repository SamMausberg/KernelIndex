#!/usr/bin/env node
// ki — the KernelIndex CLI (§13.8). Human-readable tables by default; the
// --json/--jsonl output is stable machine output with no decorative noise,
// full units, and untruncated digests. Exit codes: 0 ok, 1 error, 2 usage.
import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"
import {
  type CompareModel,
  client,
  type ResolveEnvelope,
  type ResolveKernelRequest,
  type ResolveServingRequest,
  type RunsQuery,
  type ServingResolveModel,
} from "@kernelindex/sdk"
import { digestManifest, validateManifest } from "@kernelindex/sdk/manifest"
import { parse as parseYaml } from "yaml"
import { formatPrimary, tableLines } from "./render.ts"

const HELP = `ki — KernelIndex command line

Usage:
  ki search <query…>                 resolver decision for a text query
  ki resolve kernel --manifest <p>   resolver decision for a structured request
                                     (a list of requests resolves in one call)
  ki resolve serving --manifest <p>  serving resolution: objective or Pareto
  ki show <operation|implementation|run|serving-run> <id-or-slug>
  ki compare run <id> <id> [...]     aligned comparison (2–8 runs)
  ki records [--limit n] [--cursor c]   current record holders, newest first
  ki changes [--since <iso>]         what the index learned, newest first
  ki runs [filters]                  published runs, newest first (paged)
  ki hardware                        per-GPU kernel/serving coverage
  ki models                          serving models + kernel model: tags
  ki serving <runs|configs>          serving corpus listings
  ki export                          immutable catalog export URL
  ki auth status                     API key identity, scopes, and quota
  ki manifest validate <path>        validate a manifest against its schema
  ki manifest digest <path>          canonical RFC 8785 spec digest

Flags:
  --api <url>      API base (default $KI_API or https://kernelindex.com/api/v1)
  --api-key <key>  API key (default $KI_API_KEY); sent as a bearer token
  --json           machine JSON on stdout
  --jsonl          one JSON line per result row
  --quiet          suppress human headers
  --limit <n>      page size for listings
  --cursor <c>     pagination cursor from a previous listing

ki runs filters:
  --operation <id-or-slug>  --hardware <model>  --source <slug>
  --status <status>         --since <iso timestamp>
`

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    api: { type: "string" },
    "api-key": { type: "string" },
    manifest: { type: "string" },
    json: { type: "boolean", default: false },
    jsonl: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
    limit: { type: "string" },
    cursor: { type: "string" },
    operation: { type: "string" },
    hardware: { type: "string" },
    source: { type: "string" },
    status: { type: "string" },
    since: { type: "string" },
  },
})

function usage(message?: string): never {
  if (message) console.error(message)
  console.error(HELP)
  process.exit(2)
}

if (values.help || positionals.length === 0) usage()

const api = client({
  baseUrl: values.api ?? process.env.KI_API ?? "https://kernelindex.com/api/v1",
  apiKey: values["api-key"] ?? process.env.KI_API_KEY,
})

/** Machine output: exactly one JSON document, or one line per row. A command
 * without row semantics rejects --jsonl instead of silently degrading. */
function emit(document: unknown, rows?: unknown[]) {
  if (values.jsonl) {
    if (!rows) usage("--jsonl is not available for this command; use --json")
    for (const row of rows) console.log(JSON.stringify(row))
    return true
  }
  if (values.json) {
    console.log(JSON.stringify(document, null, 2))
    return true
  }
  return false
}

function pageOptions() {
  const limit = values.limit === undefined ? undefined : Number(values.limit)
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1))
    usage("--limit must be a positive integer")
  return { limit, cursor: values.cursor }
}

function table(rows: string[][]) {
  for (const line of tableLines(rows)) console.log(line)
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
  const cut = Object.values(envelope.overflow).reduce((a, b) => a + b, 0)
  if (cut > 0 && !values.quiet) {
    console.log(`${cut} rows past the payload cap not shown`)
  }
  // §12.5 bracketing: an unmeasured case states its measured neighbours.
  if (envelope.groups.exact.length === 0 && envelope.nearest) {
    const { axis, requested, below, above } = envelope.nearest
    console.log(`not measured at ${axis} = ${requested}; nearest measured:`)
    table(
      [below, above]
        .filter((side) => side !== null)
        .map((side) => [
          `${axis} = ${side.value}`,
          formatPrimary(side.head?.primary ?? null),
          side.head?.implementation.name ?? "no ranked run",
          `${side.runs} runs`,
          `ki search ${JSON.stringify(side.query)}`,
        ]),
    )
  }
}

/** Serving output (§13.8): per-cohort tables, frontier marked, no score. */
function printServing(model: ServingResolveModel) {
  if (!values.quiet) console.log(`serving resolution · ${model.policyVersion}`)
  for (const group of model.groups) {
    console.log(`\n${group.description}`)
    const value = (
      row: (typeof group.rows)[number],
      metric: string,
      statistic: string,
    ) =>
      row.measurements
        .find((m) => m.metric === metric && m.statistic === statistic)
        ?.value.toLocaleString("en-US") ?? "—"
    table([
      [
        "#",
        "configuration",
        "stack",
        "tokens/s",
        "ttft p99",
        "gpus",
        "quality",
      ],
      ...group.rows.map((row) => [
        row.rank !== null ? String(row.rank) : row.onFrontier ? "◆" : "",
        row.configuration,
        row.stack,
        value(row, "output_token_throughput_tps", "reported"),
        value(row, "ttft_ms", "p99"),
        String(row.hardware.total),
        row.qualityPolicy,
      ]),
    ])
    for (const entry of group.excluded)
      console.log(
        `excluded: ${entry.configuration} · ${entry.reasons.join(", ")}`,
      )
  }
}

function printCompare(model: CompareModel) {
  console.log(model.explanation)
  table(
    model.runs.map((run) => [
      run.rank === null ? "—" : String(run.rank),
      run.implementation.name,
      formatPrimary(run.primary),
      run.evidence,
      run.hardware,
    ]),
  )
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
    if (!values.manifest || !["kernel", "serving"].includes(rest[0]))
      usage("usage: ki resolve <kernel|serving> --manifest <path>")
    // The request file is unvalidated user input; the server validates it.
    const request = readManifestFile(values.manifest)
    if (rest[0] === "serving") {
      const model = await api.resolveServing(request as ResolveServingRequest)
      if (emit(model, model.groups)) return 0
      printServing(model)
      return 0
    }
    // A list resolves every request in one call (agents planning a model).
    if (Array.isArray(request)) {
      const batch = await api.resolveKernels(request as ResolveKernelRequest[])
      if (emit(batch, batch.results)) return 0
      batch.results.forEach((envelope, index) => {
        if (index > 0) console.log("")
        printEnvelope(envelope)
      })
      return 0
    }
    const envelope = await api.resolveKernel(request as ResolveKernelRequest)
    if (emit(envelope, envelope.groups.exact)) return 0
    printEnvelope(envelope)
    return 0
  }

  if (command === "show") {
    const [kind, id] = rest
    if (
      !id ||
      !["operation", "implementation", "run", "serving-run"].includes(kind)
    )
      usage("usage: ki show <operation|implementation|run|serving-run> <id>")
    const dossier = await api.show(
      kind as "operation" | "implementation" | "run" | "serving-run",
      id,
    )
    if (emit(dossier)) return 0
    console.log(JSON.stringify(dossier, null, 2))
    return 0
  }

  if (command === "compare") {
    if (rest[0] !== "run" || rest.length < 3)
      usage("usage: ki compare run <id> <id> [...]")
    const model = await api.compare(rest.slice(1))
    if (emit(model, model.runs)) return 0
    printCompare(model)
    return 0
  }

  if (command === "records") {
    const page = await api.records(pageOptions())
    if (emit(page, page.records)) return 0
    if (!values.quiet && page.records[0])
      console.log(`current records · newest first`)
    table([
      [
        "operation",
        "workload",
        "record",
        "implementation",
        "hardware",
        "since",
      ],
      ...page.records.map((holder) => [
        holder.operation.name,
        holder.workloadSummary,
        formatPrimary(holder.current.primary),
        holder.current.implementation.name,
        holder.hardware,
        holder.since.slice(0, 10),
      ]),
    ])
    if (page.nextCursor && !values.quiet)
      console.log(`next: ki records --cursor ${page.nextCursor}`)
    return 0
  }

  if (command === "changes") {
    const feed = await api.feed({ since: values.since })
    const entries = feed.days.flatMap((day) => day.entries)
    if (emit(feed, entries)) return 0
    table(
      entries.map((entry) => [
        entry.at.slice(0, 10),
        entry.kind,
        entry.kind === "record"
          ? `${entry.operation.name} · ${entry.workloadSummary} · ${entry.hardware}: ${entry.implementation.name} at ${formatPrimary(entry.value)}${entry.improvementPct === null ? "" : ` (${entry.improvementPct.toFixed(1)}% faster)`}`
          : entry.kind === "import"
            ? `${entry.source.name} · ${entry.runs} runs · ${entry.operations} operations · ${entry.firstRecords} first records`
            : entry.kind === "correction"
              ? `${entry.implementation.name} on ${entry.operation.name} ${entry.action}${entry.reason ? `: ${entry.reason}` : ""}`
              : `${entry.project.name} claimed by ${entry.by}`,
      ]),
    )
    return 0
  }

  if (command === "runs") {
    const page = await api.runs({
      ...pageOptions(),
      operation: values.operation,
      hardware: values.hardware,
      source: values.source,
      // User input; the server 400s an unknown status value.
      status: values.status as RunsQuery["status"],
      since: values.since,
    })
    if (emit(page, page.runs)) return 0
    table([
      ["id", "operation", "implementation", "value", "status", "observed"],
      ...page.runs.map((run) => [
        run.id,
        run.operation,
        run.implementation,
        formatPrimary(run.primary),
        run.status,
        run.observedAt.slice(0, 10),
      ]),
    ])
    if (page.nextCursor && !values.quiet)
      console.log(`next: ki runs --cursor ${page.nextCursor}`)
    return 0
  }

  if (command === "hardware") {
    const { hardware } = await api.hardware()
    if (emit(hardware, hardware)) return 0
    table([
      ["model", "vendor", "kernel runs", "serving runs", "families", "last"],
      ...hardware.map((gpu) => [
        gpu.model,
        gpu.vendor ?? "—",
        String(gpu.kernelRuns),
        String(gpu.servingRuns),
        String(gpu.families),
        gpu.lastObservedAt?.slice(0, 10) ?? "—",
      ]),
    ])
    return 0
  }

  if (command === "models") {
    const coverage = await api.models()
    if (emit(coverage)) return 0
    if (!values.quiet) console.log("serving models")
    table([
      ["model", "params", "runs"],
      ...coverage.serving.map((model) => [
        model.slug,
        model.parameterCount === null
          ? "—"
          : `${(model.parameterCount / 1e9).toFixed(1)}B`,
        String(model.runs),
      ]),
    ])
    if (!values.quiet) console.log("\nkernel model: tags")
    table([
      ["model", "operations"],
      ...coverage.kernel.map((tag) => [tag.model, String(tag.operations)]),
    ])
    return 0
  }

  if (command === "serving") {
    if (rest[0] === "runs") {
      const page = await api.servingRuns(pageOptions())
      if (emit(page, page.runs)) return 0
      table([
        ["id", "model", "stack", "scenario", "hardware", "gpus", "observed"],
        ...page.runs.map((run) => [
          run.id,
          run.model,
          run.stack,
          run.scenario,
          run.hardware,
          String(run.totalAccelerators),
          run.observedAt.slice(0, 10),
        ]),
      ])
      if (page.nextCursor && !values.quiet)
        console.log(`next: ki serving runs --cursor ${page.nextCursor}`)
      return 0
    }
    if (rest[0] === "configs") {
      const configs = await api.servingConfigurations()
      if (emit(configs, configs)) return 0
      table([
        ["stack", "configuration", "dtype", "runs"],
        ...configs.map((config) => [
          config.stack,
          config.summary,
          config.dtype ?? "—",
          String(config.runs),
        ]),
      ])
      return 0
    }
    usage("usage: ki serving <runs|configs>")
  }

  if (command === "export") {
    const url = await api.exportUrl()
    if (emit({ url })) return 0
    console.log(url)
    return 0
  }

  if (command === "auth") {
    if (rest[0] !== "status") usage("usage: ki auth status")
    const identity = await api.me()
    if (emit(identity)) return 0
    console.log(
      `key ${identity.name ?? identity.keyId} · scopes ${identity.scopes.join(", ")}` +
        (identity.quotaPerDay !== null
          ? ` · ${identity.usedToday ?? 0}/${identity.quotaPerDay} today`
          : ""),
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
