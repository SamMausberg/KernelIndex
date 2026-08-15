// /api/v1 (§13): the nine initial routes over the same read seam the pages
// use — never a loopback HTTP call, never reimplemented ranking. Responses
// carry stable IDs, digests, canonical units, absolute timestamps, and the
// ranking policy version; errors are RFC 9457 Problem Details.
import { readFileSync } from "node:fs"
import path from "node:path"
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { HTTPException } from "hono/http-exception"
import { revalidateTag } from "next/cache.js"
import {
  getComparePage,
  getImplementationPage,
  getOperationPage,
  getRecordsPage,
  getRunPage,
  searchCatalog,
} from "../../lib/catalog.ts"
import type { ResultRow, SearchPageModel } from "../../lib/catalog-models.ts"
import { deployability } from "../policy/deployability.ts"
import { RANKING_POLICY_VERSION } from "../policy/ranking.ts"
import {
  compareResponse,
  problemDetails,
  type ResolveKernelRequest,
  recordsResponse,
  resolveKernelRequest,
  resolveResponse,
} from "./schemas.ts"

const CACHE_SHORT = "public, s-maxage=60, stale-while-revalidate=300"
const CACHE_MEDIUM = "public, s-maxage=300, stale-while-revalidate=86400"

/** RFC 9457 Problem Details thrown as an HTTPException (§13.5). */
function fail(
  status: 400 | 401 | 404 | 422,
  code: string,
  detail: string,
): never {
  const body = {
    type: `https://kernelindex.dev/errors/${code.toLowerCase()}`,
    title: code.replaceAll("_", " ").toLowerCase(),
    status,
    code,
    detail,
    requestId: crypto.randomUUID(),
  }
  throw new HTTPException(status, {
    res: new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/problem+json" },
    }),
  })
}

const isVerified = (row: ResultRow) =>
  row.evidence === "verified" || row.evidence === "replicated"
const isDeployable = (row: ResultRow) =>
  deployability({
    sourceAvailable: row.sourceAvailable,
    installable: row.installable,
    licenseConcluded: row.license.concluded,
  }).eligible

/** §13.3 envelope from the same model the web page renders. */
function resolveEnvelope(model: SearchPageModel) {
  return {
    query: model.query,
    interpretation: model.interpretedQuery,
    mode:
      model.operation !== null
        ? ("exact" as const)
        : model.matches !== null
          ? ("chooser" as const)
          : model.browse !== null
            ? ("browse" as const)
            : ("none" as const),
    operation: model.operation,
    policyVersion: RANKING_POLICY_VERSION,
    cohort: model.cohort,
    bestVerified: model.groups.exact.find(isVerified) ?? null,
    bestDeployable: model.groups.exact.find(isDeployable) ?? null,
    groups: model.groups,
    compatibleOverflow: model.compatibleOverflow,
    matches: model.matches,
    sources: model.sources,
    generatedAt: new Date().toISOString(),
  }
}

/** Compose the search grammar from a structured resolve request (§12.6). */
export function composeQuery(request: ResolveKernelRequest): string {
  const parts: string[] = []
  if (request.query) parts.push(request.query)
  if (request.operation?.name) parts.push(request.operation.name)
  else if (request.operation?.family) parts.push(request.operation.family)
  for (const [axis, value] of Object.entries(request.operation?.axes ?? {})) {
    parts.push(`${axis}=${value}`)
  }
  if (request.environment?.hardwareProduct)
    parts.push(request.environment.hardwareProduct)
  if (request.environment?.dtype)
    parts.push(`dtype:${request.environment.dtype}`)
  if (request.policy?.minimumTrust)
    parts.push(`trust:${request.policy.minimumTrust}`)
  if (request.policy?.license) parts.push(`license:${request.policy.license}`)
  if (request.policy?.sourceRequired) parts.push("source:true")
  if (request.policy?.installableRequired) parts.push("installable:true")
  return parts.join(" ").trim()
}

const problemResponses = {
  404: {
    description: "Not found",
    content: { "application/json": { schema: problemDetails } },
  },
} as const

function json<S extends z.ZodType>(schema: S, description: string) {
  return {
    200: { description, content: { "application/json": { schema } } },
    ...problemResponses,
  }
}

export const api = new OpenAPIHono()

api.openapi(
  createRoute({
    method: "get",
    path: "/search",
    request: { query: z.object({ q: z.string().max(500).default("") }) },
    responses: json(resolveResponse, "Resolver decision for a text query"),
  }),
  async (c) => {
    const { q } = c.req.valid("query")
    const model = await searchCatalog({ query: q })
    c.header("Cache-Control", CACHE_SHORT)
    return c.json(resolveEnvelope(model))
  },
)

api.openapi(
  createRoute({
    method: "post",
    path: "/resolve/kernel",
    request: {
      body: {
        content: { "application/json": { schema: resolveKernelRequest } },
      },
    },
    responses: json(
      resolveResponse,
      "Resolver decision for a structured request",
    ),
  }),
  async (c) => {
    const request = c.req.valid("json")
    const model = await searchCatalog({ query: composeQuery(request) })
    return c.json(resolveEnvelope(model))
  },
)

// Dossier responses reuse the page models verbatim; the OpenAPI document
// describes them as open objects (the typed contracts live on the resolver,
// records, and compare routes).
const record = z.unknown()

api.openapi(
  createRoute({
    method: "get",
    path: "/operations/{idOrSlug}",
    request: {
      params: z.object({ idOrSlug: z.string().max(200) }),
      query: z.object({
        workload: z.string().max(100).optional(),
        cohort: z.string().max(200).optional(),
      }),
    },
    responses: json(record, "Operation dossier (the web page's model)"),
  }),
  async (c) => {
    const { idOrSlug } = c.req.valid("param")
    const { workload, cohort } = c.req.valid("query")
    const model = await getOperationPage(idOrSlug, workload, cohort)
    if (!model) fail(404, "OPERATION_NOT_FOUND", idOrSlug)
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(model)
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/implementations/{idOrSlug}",
    request: {
      params: z.object({ idOrSlug: z.string().max(200) }),
      // Bounded include (§13.2): source adds the mirrored code body.
      query: z.object({ include: z.enum(["source"]).optional() }),
    },
    responses: json(record, "Implementation dossier"),
  }),
  async (c) => {
    const { idOrSlug } = c.req.valid("param")
    const { include } = c.req.valid("query")
    const model = await getImplementationPage(idOrSlug)
    if (!model) fail(404, "IMPLEMENTATION_NOT_FOUND", idOrSlug)
    c.header("Cache-Control", CACHE_MEDIUM)
    if (include === "source") return c.json(model)
    const { sourceCode, ...rest } = model
    return c.json({
      ...rest,
      sourceCode:
        sourceCode === null
          ? null
          : { ...sourceCode, content: undefined, diff: undefined },
    })
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/runs/{idOrDigest}",
    request: { params: z.object({ idOrDigest: z.string().max(200) }) },
    responses: json(record, "Immutable run evidence dossier"),
  }),
  async (c) => {
    const { idOrDigest } = c.req.valid("param")
    const model = await getRunPage(idOrDigest)
    if (!model) fail(404, "RUN_NOT_FOUND", idOrDigest)
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(model)
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/records",
    request: {
      query: z.object({
        cursor: z.string().max(500).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    },
    responses: {
      ...json(recordsResponse, "Records ledger page (cursor-paginated)"),
      400: {
        description: "Invalid cursor",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    const { cursor, limit } = c.req.valid("query")
    const model = await getRecordsPage()
    // Cursor binds the sort position (since desc) plus the stable cohort key
    // tiebreaker (§13.4); an unknown cursor restarts from the head.
    let start = 0
    if (cursor !== undefined) {
      const [since, cohortKey] = Buffer.from(cursor, "base64url")
        .toString()
        .split(" ")
      const index = model.records.findIndex(
        (holder) => holder.since === since && holder.cohortKey === cohortKey,
      )
      if (index === -1) fail(400, "INVALID_CURSOR", cursor)
      start = index + 1
    }
    const page = model.records.slice(start, start + limit)
    const last = page.at(-1)
    const nextCursor =
      last !== undefined && start + limit < model.records.length
        ? Buffer.from(`${last.since} ${last.cohortKey}`).toString("base64url")
        : null
    c.header("Cache-Control", CACHE_SHORT)
    return c.json(
      { records: page, nextCursor, generatedAt: new Date().toISOString() },
      200,
    )
  },
)

api.openapi(
  createRoute({
    method: "post",
    path: "/compare",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              runs: z.array(z.string().max(200)).min(1).max(8),
            }),
          },
        },
      },
    },
    responses: json(compareResponse, "Aligned comparison of 2–8 runs"),
  }),
  async (c) => {
    const { runs } = c.req.valid("json")
    const model = await getComparePage(runs)
    return c.json(model)
  },
)

// Versioned immutable export (§13.2): redirect to the latest snapshot; the
// catalog is never rebuilt during an ordinary request.
api.get("/exports/catalog.jsonl.zst", (c) => {
  try {
    const pointer = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "../../registry/exports/latest.json"),
        "utf8",
      ),
    ) as { url: string }
    return c.redirect(pointer.url, 302)
  } catch {
    fail(
      404,
      "EXPORT_NOT_AVAILABLE",
      "no catalog export has been generated yet",
    )
  }
})

// §10.8 step 9: the importer calls this after publishing so caches drop
// immediately instead of waiting out the revalidate window.
api.post("/revalidate", (c) => {
  const token = process.env.REVALIDATE_TOKEN
  if (!token || c.req.header("authorization") !== `Bearer ${token}`) {
    fail(401, "UNAUTHORIZED", "missing or invalid token")
  }
  revalidateTag("catalog", "max")
  return c.json({ revalidated: true, at: new Date().toISOString() })
})

api.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "KernelIndex API",
    version: "v1",
    description:
      "Public read API over the KernelIndex catalog. Responses carry stable IDs, content digests, canonical units, and the ranking policy version; the web pages, CLI, and MCP render these same semantic results.",
  },
})

api.notFound(() => fail(404, "NOT_FOUND", "no such route"))
api.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  console.error(c.req.path, error)
  return new Response(JSON.stringify({ status: 500, code: "INTERNAL" }), {
    status: 500,
    headers: { "Content-Type": "application/problem+json" },
  })
})
