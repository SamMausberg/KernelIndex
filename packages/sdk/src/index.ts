// Generated-contract API client (§13.9): openapi-fetch over the types
// emitted from apps/web's runtime schemas (`pnpm openapi:generate`). The
// wrapper owns the base URL, the API-key header, and typed errors from
// RFC 9457 problem responses; generated files are overwritten, never edited.
import createClient from "openapi-fetch"
import type { paths } from "./generated/api.d.ts"

type Ok<P, M extends string = "get"> = M extends keyof P
  ? P[M] extends {
      responses: { 200: { content: { "application/json": infer R } } }
    }
    ? R
    : never
  : never

export type ResolveEnvelope = Ok<paths["/search"]>
export type CompareModel = Ok<paths["/compare"], "post">
export type ServingResolveModel = Ok<paths["/resolve/serving"], "post">
export type OperationDossier = Ok<paths["/operations/{idOrSlug}"]>
export type ImplementationDossier = Ok<paths["/implementations/{idOrSlug}"]>
export type RunDossier = Ok<paths["/runs/{idOrDigest}"]>
export type ServingRunDossier = Ok<paths["/serving-runs/{id}"]>
export type RecordsPage = Ok<paths["/records"]>
export type ServingRunsPage = Ok<paths["/serving-runs"]>
export type ServingConfigurations = Ok<paths["/serving-configurations"]>
export type KeyIdentity = Ok<paths["/me"]>
export type ResolveKernelRequest = NonNullable<
  paths["/resolve/kernel"]["post"]["requestBody"]
>["content"]["application/json"]
export type ResolveServingRequest = NonNullable<
  paths["/resolve/serving"]["post"]["requestBody"]
>["content"]["application/json"]

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

/** Unwrap an openapi-fetch result or throw the ApiError it carries. */
function unwrap<T>(result: {
  data?: T
  error?: unknown
  response: Response
}): T {
  if (result.data === undefined) fail(result.response, result.error)
  return result.data
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
  const typed = {
    async search(q: string): Promise<ResolveEnvelope> {
      return unwrap(await api.GET("/search", { params: { query: { q } } }))
    },
    async resolveKernel(body: ResolveKernelRequest): Promise<ResolveEnvelope> {
      return unwrap(await api.POST("/resolve/kernel", { body }))
    },
    async getOperation(
      idOrSlug: string,
      query?: { workload?: string; cohort?: string },
    ): Promise<OperationDossier> {
      return unwrap(
        await api.GET("/operations/{idOrSlug}", {
          params: { path: { idOrSlug }, query },
        }),
      )
    },
    async getImplementation(
      idOrSlug: string,
      options?: { includeSource?: boolean },
    ): Promise<ImplementationDossier> {
      return unwrap(
        await api.GET("/implementations/{idOrSlug}", {
          params: {
            path: { idOrSlug },
            query: options?.includeSource ? { include: "source" } : {},
          },
        }),
      )
    },
    async getRun(idOrDigest: string): Promise<RunDossier> {
      return unwrap(
        await api.GET("/runs/{idOrDigest}", {
          params: { path: { idOrDigest } },
        }),
      )
    },
    async compare(runs: string[]): Promise<CompareModel> {
      return unwrap(await api.POST("/compare", { body: { runs } }))
    },
    async records(query?: {
      cursor?: string
      limit?: number
    }): Promise<RecordsPage> {
      return unwrap(await api.GET("/records", { params: { query } }))
    },
    async resolveServing(
      body: ResolveServingRequest,
    ): Promise<ServingResolveModel> {
      return unwrap(await api.POST("/resolve/serving", { body }))
    },
    async servingRuns(query?: {
      cursor?: string
      limit?: number
    }): Promise<ServingRunsPage> {
      return unwrap(await api.GET("/serving-runs", { params: { query } }))
    },
    async servingConfigurations(): Promise<ServingConfigurations> {
      return unwrap(await api.GET("/serving-configurations", {}))
    },
    async getServingRun(id: string): Promise<ServingRunDossier> {
      return unwrap(
        await api.GET("/serving-runs/{id}", { params: { path: { id } } }),
      )
    },
    async me(): Promise<KeyIdentity> {
      return unwrap(await api.GET("/me", {}))
    },
    /** Resolve the immutable catalog export URL without downloading it. */
    async exportUrl(): Promise<string> {
      const response = await fetch(`${baseUrl}/exports/catalog.jsonl.zst`, {
        headers,
        redirect: "manual",
      })
      const location = response.headers.get("location")
      if (response.status !== 302 || !location)
        fail(response, await response.json().catch(() => null))
      return location
    },
  }
  return {
    ...typed,
    /** Dossier dispatch by kind; `ki show` and the MCP tools consume it. */
    async show(
      kind: "operation" | "implementation" | "run" | "serving-run",
      id: string,
      options?: { includeSource?: boolean },
    ): Promise<
      OperationDossier | ImplementationDossier | RunDossier | ServingRunDossier
    > {
      switch (kind) {
        case "operation":
          return typed.getOperation(id)
        case "implementation":
          return typed.getImplementation(id, options)
        case "run":
          return typed.getRun(id)
        case "serving-run":
          return typed.getServingRun(id)
      }
    },
  }
}
