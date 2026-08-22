#!/usr/bin/env node
import { realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import {
  client,
  type ResolveKernelRequest,
  type ResolveServingRequest,
  type RunsQuery,
} from "@kernelindex/sdk"
import {
  digestManifestDocument,
  parseManifestText,
  readManifestSchema,
  validateManifestDocument,
} from "@kernelindex/sdk/manifest"
// KernelIndex MCP server (§13.10): a thin, read-only transport over the
// generated SDK. Every tool answers from the public REST API or the local
// registry schemas — the same semantic results the web pages render, never
// scraped HTML, never server-runtime imports (§6.4), never code execution.
//
// Run from the checkout over stdio:
//   node apps/mcp/src/server.ts
// Environment: KI_API (base URL), KI_API_KEY (optional bearer key).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"

const api = client({
  baseUrl: process.env.KI_API ?? "https://kernelindex.com/api/v1",
  apiKey: process.env.KI_API_KEY,
})

/** Every tool returns one JSON text block: stable machine output. */
const json = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
})

export function buildServer(): McpServer {
  const server = new McpServer({ name: "kernelindex", version: "1.0.0" })

  server.registerTool(
    "search_catalog",
    {
      description:
        "Resolve a text query (operation, hardware, dtype, shape facets) to ranked, comparable kernel results with digests, trust facts, and caveats.",
      inputSchema: { q: z.string().max(500) },
    },
    async ({ q }) => json(await api.search(q)),
  )

  server.registerTool(
    "resolve_kernel",
    {
      description:
        "Resolver decision for a structured kernel request: operation name/family, axis bindings, hardware, dtype, and policy constraints.",
      inputSchema: {
        request: z
          .record(z.string(), z.unknown())
          .describe("ResolveKernelRequest per /openapi.json"),
      },
    },
    async ({ request }) =>
      json(await api.resolveKernel(request as ResolveKernelRequest)),
  )

  server.registerTool(
    "resolve_kernels",
    {
      description:
        "Resolve up to twenty structured kernel requests in one call (every operation of a model, say); one resolver decision per request, in order.",
      inputSchema: {
        requests: z
          .array(z.record(z.string(), z.unknown()))
          .min(1)
          .max(20)
          .describe("ResolveKernelRequest[] per /openapi.json"),
      },
    },
    async ({ requests }) =>
      json(await api.resolveKernels(requests as ResolveKernelRequest[])),
  )

  server.registerTool(
    "get_operation",
    {
      description:
        "Operation dossier by slug or ID: semantics, workloads, current records, and implementations.",
      inputSchema: { idOrSlug: z.string().max(200) },
    },
    async ({ idOrSlug }) => json(await api.show("operation", idOrSlug)),
  )

  server.registerTool(
    "get_implementation",
    {
      description:
        "Implementation dossier by slug or ID; includeSource adds the mirrored kernel source when available.",
      inputSchema: {
        idOrSlug: z.string().max(200),
        includeSource: z.boolean().default(false),
      },
    },
    async ({ idOrSlug, includeSource }) =>
      json(await api.getImplementation(idOrSlug, { includeSource })),
  )

  server.registerTool(
    "get_benchmark_evidence",
    {
      description:
        "Run dossier by ID or sha256 digest: measurements, correctness, protocol, environment, artifacts, and lifecycle.",
      inputSchema: { idOrDigest: z.string().max(200) },
    },
    async ({ idOrDigest }) => json(await api.show("run", idOrDigest)),
  )

  server.registerTool(
    "compare_runs",
    {
      description:
        "Aligned comparison of 2-8 runs by ID; incomparable selections come back explained, never force-ranked.",
      inputSchema: { runs: z.array(z.string()).min(2).max(8) },
    },
    async ({ runs }) => json(await api.compare(runs)),
  )

  server.registerTool(
    "list_records",
    {
      description:
        "Current record holders across comparison cohorts, newest first, cursor-paginated; each carries its full record history.",
      inputSchema: {
        cursor: z.string().max(500).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    async ({ cursor, limit }) => json(await api.records({ cursor, limit })),
  )

  server.registerTool(
    "list_changes",
    {
      description:
        "What the index learned over the trailing 30 days: record breaks, publication batches, corrections, accepted claims; newest first by UTC day. `since` narrows to entries after that ISO instant.",
      inputSchema: { since: z.string().max(40).optional() },
    },
    async ({ since }) => json(await api.feed({ since })),
  )

  server.registerTool(
    "list_runs",
    {
      description:
        "Enumerate published benchmark runs, newest first, cursor-paginated; filter by operation (id or slug), hardware model, source slug, run status, or observed-since timestamp.",
      inputSchema: {
        operation: z.string().max(200).optional(),
        hardware: z.string().max(200).optional(),
        source: z.string().max(200).optional(),
        status: z.string().max(40).optional(),
        since: z.string().max(40).optional(),
        cursor: z.string().max(200).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    // Status is passed through; the server 400s unknown values.
    async (query) => json(await api.runs(query as RunsQuery)),
  )

  server.registerTool(
    "list_hardware",
    {
      description:
        "Per-GPU corpus coverage: kernel and serving run counts and distinct operation families for every measured accelerator (counts, never a shared ranking).",
      inputSchema: {},
    },
    async () => json(await api.hardware()),
  )

  server.registerTool(
    "list_models",
    {
      description:
        "Model coverage: serving model revisions with run counts, and kernel-side model: workload-provenance tags with operation counts — two separate arrays.",
      inputSchema: {},
    },
    async () => json(await api.models()),
  )

  server.registerTool(
    "resolve_serving",
    {
      description:
        "Feasible serving configurations for a model/workload/hardware request, grouped by cohort; ranked only under an explicit objective, the Pareto frontier otherwise.",
      inputSchema: {
        request: z
          .record(z.string(), z.unknown())
          .describe("ResolveServingRequest per /openapi.json"),
      },
    },
    async ({ request }) =>
      json(await api.resolveServing(request as ResolveServingRequest)),
  )

  server.registerTool(
    "get_serving_run",
    {
      description:
        "Serving run evidence dossier by ID: configuration, topology, measurements, caveats, and attribution.",
      inputSchema: { id: z.string().max(200) },
    },
    async ({ id }) => json(await api.getServingRun(id)),
  )

  server.registerTool(
    "validate_manifest",
    {
      description:
        "Schema-validate a KernelIndex manifest (YAML or JSON text) against the generated registry schemas, locally, and return its canonical spec digest when valid.",
      inputSchema: {
        content: z.string().max(1_048_576),
        format: z.enum(["yaml", "json"]).default("yaml"),
      },
    },
    async ({ content, format }) => {
      const document = parseManifestText(content, format)
      const result = validateManifestDocument(document)
      return json(
        result.valid
          ? { ...result, ...digestManifestDocument(document) }
          : result,
      )
    },
  )

  server.registerTool(
    "get_manifest_schema",
    {
      description:
        "The generated JSON Schema for a manifest kind (e.g. BenchmarkRun, OperationSpec, WorkloadCase).",
      inputSchema: { kind: z.string().max(80) },
    },
    async ({ kind }) => {
      const schema = readManifestSchema(kind)
      if (schema === null) throw new Error(`no schema for kind '${kind}'`)
      return json(schema)
    },
  )

  return server
}

// Connect stdio only when executed directly, so tests import buildServer.
// argv[1] is realpathed and compared as a URL so the check holds for the
// checkout (server.ts), the built package (server.js), and bin symlinks.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  await buildServer().connect(new StdioServerTransport())
}
