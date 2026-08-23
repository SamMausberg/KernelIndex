// Hosted MCP endpoint (§13.10): the same read-only tool server the stdio
// package runs, over Streamable HTTP at https://kernelindex.com/mcp — one
// URL to paste, no checkout, no npx. Stateless: each POST builds a fresh
// transport, and the tools answer through this deployment's own public
// /api/v1 exactly like every other client (§6.4: never server-runtime
// imports). Keyless like anonymous REST; a bearer key raises the quota.
import { buildServer } from "@kernelindex/mcp/server"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { env } from "@/server/env"

export async function POST(request: Request): Promise<Response> {
  const origin = env.SITE_ORIGIN ?? new URL(request.url).origin
  const bearer = request.headers.get("Authorization")?.match(/^Bearer (.+)$/)
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode: no session ids, plain JSON responses, no SSE stream
    // to keep open across serverless invocations.
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  const server = buildServer({
    baseUrl: `${origin}/api/v1`,
    apiKey: bearer?.[1],
  })
  await server.connect(transport)
  try {
    return await transport.handleRequest(request)
  } finally {
    void transport.close()
  }
}

// Streamable HTTP also defines GET (server-initiated stream) and DELETE
// (session teardown); both are meaningless without sessions. Answered
// directly with 405 — the stateless transport would otherwise hold an SSE
// stream open forever, pinning a serverless invocation per client.
export function GET(): Response {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed: stateless transport, POST only",
      },
      id: null,
    },
    { status: 405, headers: { Allow: "POST" } },
  )
}

export const DELETE = GET
