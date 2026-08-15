// Generated-contract API client (§13.9): openapi-fetch over the types
// emitted from apps/web's runtime schemas (`pnpm openapi:generate`).
import createClient from "openapi-fetch"
import type { paths } from "./generated/api.d.ts"

export type ResolveEnvelope =
  paths["/search"]["get"]["responses"]["200"]["content"]["application/json"]
export type CompareModel =
  paths["/compare"]["post"]["responses"]["200"]["content"]["application/json"]

function fail(response: Response, error: unknown): never {
  const detail =
    error !== null && typeof error === "object" && "detail" in error
      ? String((error as { detail: unknown }).detail)
      : response.statusText
  throw new Error(`${response.status} ${detail}`)
}

export function client(baseUrl: string) {
  const api = createClient<paths>({ baseUrl })
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
    async show(kind: string, id: string): Promise<unknown> {
      const path =
        kind === "operation"
          ? (`/operations/${id}` as const)
          : kind === "implementation"
            ? (`/implementations/${id}` as const)
            : (`/runs/${id}` as const)
      const response = await fetch(`${baseUrl}${path}`)
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
