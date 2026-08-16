// Generated-contract API client (§13.9): openapi-fetch over the types
// emitted from apps/web's runtime schemas (`pnpm openapi:generate`). The
// wrapper owns the base URL, the API-key header, and typed errors from
// RFC 9457 problem responses; generated files are overwritten, never edited.
import createClient from "openapi-fetch"
import type { paths } from "./generated/api.d.ts"

export type ResolveEnvelope =
  paths["/search"]["get"]["responses"]["200"]["content"]["application/json"]
export type CompareModel =
  paths["/compare"]["post"]["responses"]["200"]["content"]["application/json"]

/** An API problem (RFC 9457): status, machine code, and human detail. */
export class ApiError extends Error {
  status: number
  code: string | null
  constructor(status: number, code: string | null, detail: string) {
    super(`${status} ${detail}`)
    this.status = status
    this.code = code
  }
}

function fail(response: Response, error: unknown): never {
  const problem =
    error !== null && typeof error === "object"
      ? (error as { code?: unknown; detail?: unknown })
      : {}
  throw new ApiError(
    response.status,
    typeof problem.code === "string" ? problem.code : null,
    typeof problem.detail === "string" ? problem.detail : response.statusText,
  )
}

export function client({
  baseUrl,
  apiKey,
}: {
  baseUrl: string
  apiKey?: string
}) {
  const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined
  const api = createClient<paths>({ baseUrl, headers })
  return {
    async search(q: string): Promise<ResolveEnvelope> {
      const { data, error, response } = await api.GET("/search", {
        params: { query: { q } },
      })
      if (data === undefined) fail(response, error)
      return data
    },
    async resolveKernel(body: unknown): Promise<ResolveEnvelope> {
      const { data, error, response } = await api.POST("/resolve/kernel", {
        body: body as never,
      })
      if (data === undefined) fail(response, error)
      return data
    },
    async show(kind: string, id: string, query = ""): Promise<unknown> {
      const path =
        kind === "operation"
          ? `/operations/${id}`
          : kind === "implementation"
            ? `/implementations/${id}`
            : `/runs/${id}`
      const response = await fetch(`${baseUrl}${path}${query}`, { headers })
      const body = (await response.json()) as unknown
      if (!response.ok) fail(response, body)
      return body
    },
    async compare(runs: string[]): Promise<CompareModel> {
      const { data, error, response } = await api.POST("/compare", {
        body: { runs },
      })
      if (data === undefined) fail(response, error)
      return data
    },
  }
}
