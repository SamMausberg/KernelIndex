#!/usr/bin/env node
import { client } from "@kernelindex/sdk"
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
    async ({ request }) => json(await api.resolveKernel(request)),
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
      json(
        await api.show(
          "implementation",
          idOrSlug,
          includeSource ? "?include=source" : "",
        ),
      ),
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
if (process.argv[1]?.endsWith("server.ts")) {
  await buildServer().connect(new StdioServerTransport())
}
