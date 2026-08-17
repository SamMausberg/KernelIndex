// API reference (§13): rendered from the same committed OpenAPI document
// the SDK is generated from, so this page cannot drift from the contract.
// Build-time import; no external assets, no client script.
import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import openapi from "../../../../../../packages/sdk/openapi.json"

export const metadata: Metadata = { title: "API reference" }

const BASE = "https://kernelindex.com/api/v1"

/** Example bodies for the POST routes, kept beside the reference. */
const EXAMPLE_BODIES: Record<string, string> = {
  "/resolve/kernel": `{"operation": {"name": "rmsnorm"}, "environment": {"hardwareProduct": "B200", "dtype": "bf16"}}`,
  "/compare": `{"runs": ["<run-id>", "<run-id>"]}`,
  "/resolve/serving": `{"model": "llama2-70b-99", "objective": {"direction": "maximize", "metric": "output_token_throughput_tps"}}`,
  "/corrections": `{"action": "retract", "runId": "<run-id>", "reason": "…"}`,
}

type Operation = {
  description?: string
  parameters?: { name: string; in: string; required?: boolean }[]
  requestBody?: unknown
  responses?: Record<string, { description?: string }>
  security?: unknown[]
}

// Multi-line examples (like /docs): no horizontal scrolling to trap
// keyboard users in, matching the axe scrollable-region budget.
function curlFor(method: string, path: string): string {
  const url = `${BASE}${path.replaceAll(/\{([^}]+)\}/g, "<$1>")}`
  if (method === "get") {
    const auth =
      path === "/me" ? '-H "Authorization: Bearer $KI_API_KEY" \\\n  ' : ""
    return `curl ${auth}"${url}${path === "/search" ? "?q=rmsnorm%20b200%20bf16" : ""}"`
  }
  const body = EXAMPLE_BODIES[path] ?? "{}"
  return `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`
}

export default function ApiReferencePage() {
  const routes = Object.entries(
    openapi.paths as Record<string, Record<string, Operation>>,
  ).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, operation]) => ({
      path,
      method,
      operation,
    })),
  )
  return (
    <>
      <div className="scan-line" />
      <ContextHeader
        title="API reference"
        context={`${routes.length} routes · ${String((openapi as { info: { version: string } }).info.version)} · problem+json errors`}
      />
      <main className="shell-narrow animate-fade-in pb-24 text-[14px] leading-relaxed text-muted">
        <p className="mt-2">
          Public read API over the catalog. Anonymous reads are CDN-cached; an
          optional <span className="font-mono text-[12.5px]">ki_</span> API key
          from <Link href="/account">/account</Link> raises the quota. The
          machine contract is{" "}
          <a href="/api/v1/openapi.json" className="font-mono text-[12.5px]">
            /api/v1/openapi.json
          </a>
          ; the TypeScript SDK, <span className="font-mono">ki</span> CLI, and
          MCP server are generated from it —{" "}
          <Link href="/docs#agents">Agents</Link> has the one-paste setup.
        </p>
        <div className="mt-8 space-y-7">
          {routes.map(({ path, method, operation }) => {
            const summary =
              operation.description ??
              operation.responses?.["200"]?.description ??
              operation.responses?.["302"]?.description ??
              ""
            const parameters = operation.parameters ?? []
            return (
              <section
                key={`${method} ${path}`}
                id={`${method}-${path.replaceAll(/[^a-z0-9]+/gi, "-")}`}
                className="border-t border-line pt-5"
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="key px-2 py-[2px] font-mono text-[11px] tracking-[0.05em] text-subtle uppercase">
                    {method}
                  </span>
                  <span className="font-mono text-[13.5px] text-fg">
                    {path}
                  </span>
                </div>
                {summary && <p className="mt-2 text-[13px]">{summary}</p>}
                {parameters.length > 0 && (
                  <p className="mt-1.5 text-[12.5px] text-subtle">
                    {parameters.map((parameter, index) => (
                      <span key={parameter.name}>
                        {index > 0 && " · "}
                        <span className="font-mono">{parameter.name}</span>{" "}
                        <span className="text-faint">
                          ({parameter.in}
                          {parameter.required ? ", required" : ""})
                        </span>
                      </span>
                    ))}
                  </p>
                )}
                <pre className="plate mt-3 overflow-x-auto px-4 py-2.5 font-mono text-[12px] leading-relaxed text-muted">
                  {curlFor(method, path)}
                </pre>
              </section>
            )
          })}
        </div>
        <p className="mt-10 border-t border-line pt-5 text-[12.5px] text-faint">
          Errors are RFC 9457 problem+json with a stable{" "}
          <span className="font-mono">code</span>. Responses carry stable IDs,
          sha256 digests, canonical units, and the ranking policy version — the
          same semantic results the web pages render.
        </p>
      </main>
    </>
  )
}
