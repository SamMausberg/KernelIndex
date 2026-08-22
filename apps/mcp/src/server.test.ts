// MCP contract (§21.2): the §13.10 tools exist at API parity, and the local
// manifest tools validate real registry examples without any network.
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { describe, expect, it } from "vitest"
import { buildServer } from "./server.ts"

const EXAMPLES = path.resolve(import.meta.dirname, "../../../registry/examples")

async function connected() {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  const client = new Client({ name: "test", version: "0.0.0" })
  await Promise.all([
    buildServer().connect(serverTransport),
    client.connect(clientTransport),
  ])
  return client
}

describe("mcp server", () => {
  it("exposes exactly the read-only tool set", async () => {
    const client = await connected()
    const { tools } = await client.listTools()
    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "compare_runs",
      "get_benchmark_evidence",
      "get_implementation",
      "get_manifest_schema",
      "get_operation",
      "get_serving_run",
      "list_changes",
      "list_hardware",
      "list_models",
      "list_records",
      "list_runs",
      "resolve_kernel",
      "resolve_kernels",
      "resolve_serving",
      "search_catalog",
      "validate_manifest",
    ])
  })

  it("validates a registry example locally and digests it", async () => {
    const client = await connected()
    const example = readdirSync(EXAMPLES).find((file) => file.endsWith(".yaml"))
    if (!example) throw new Error("no registry example found")
    const result = await client.callTool({
      name: "validate_manifest",
      arguments: {
        content: readFileSync(path.join(EXAMPLES, example), "utf8"),
      },
    })
    const body = JSON.parse((result.content as { text: string }[])[0].text) as {
      valid: boolean
      specDigest?: string
    }
    expect(body.valid).toBe(true)
    expect(body.specDigest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it("rejects an invalid manifest with schema errors", async () => {
    const client = await connected()
    const result = await client.callTool({
      name: "validate_manifest",
      arguments: {
        content: '{"kind": "OperationSpec", "spec": {}}',
        format: "json",
      },
    })
    const body = JSON.parse((result.content as { text: string }[])[0].text)
    expect(body.valid).toBe(false)
    expect(body.errors.length).toBeGreaterThan(0)
  })

  it("serves a generated manifest schema", async () => {
    const client = await connected()
    const result = await client.callTool({
      name: "get_manifest_schema",
      arguments: { kind: "BenchmarkRun" },
    })
    const schema = JSON.parse((result.content as { text: string }[])[0].text)
    expect(schema.$schema ?? schema.type ?? schema.properties).toBeTruthy()
  })
})
