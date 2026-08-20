// /api/v1 (§13): the nine initial routes over the same read seam the pages
// use — never a loopback HTTP call, never reimplemented ranking. Responses
// carry stable IDs, digests, canonical units, absolute timestamps, and the
// ranking policy version; errors are RFC 9457 Problem Details.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { cors } from "hono/cors"
import { HTTPException } from "hono/http-exception"
import { revalidateTag } from "next/cache.js"
import {
  getComparePage,
  getImplementationPage,
  getOperationPage,
  getRecordsPage,
  getRunPage,
  getServingRunPage,
  listServingConfigurations,
  listServingRuns,
  resolveServing,
  searchCatalog,
} from "../../lib/catalog.ts"
import type { ResultRow, SearchPageModel } from "../../lib/catalog-models.ts"
import { deployability } from "../policy/deployability.ts"
import { RANKING_POLICY_VERSION } from "../policy/ranking.ts"
import { listRoutes } from "./catalog-routes.ts"
import { CACHE_MEDIUM, CACHE_SHORT, fail, json } from "./http.ts"
import {
  compareResponse,
  correctionRequest,
  correctionResponse,
  implementationDossier,
  meResponse,
  operationDossier,
  problemDetails,
  type ResolveKernelRequest,
  recordsResponse,
  resolveKernelRequest,
  resolveResponse,
  resolveServingRequest,
  runDossier,
  servingConfigurationSummary,
  servingResolveResponse,
  servingRunDossier,
  servingRunsResponse,
} from "./schemas.ts"

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
    overflow: model.overflow,
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

export const api = new OpenAPIHono<{
  Variables: { apiKey?: import("../api-keys.ts").ApiKeyIdentity }
}>()

// CORS (§18.2): deny-by-default posture — the public read API allows only
// the methods and headers it needs, never credentials (a wildcard origin
// cannot carry cookies by construction, so the session-authorized routes
// stay same-origin-only).
api.use(
  cors({
    origin: "*",
    allowMethods: ["GET", "POST"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
)

api.openAPIRegistry.registerComponent("securitySchemes", "apiKey", {
  type: "http",
  scheme: "bearer",
  description:
    "Optional ki_-prefixed API key from /account. Public reads work without one; a key raises the quota and unlocks scoped writes.",
})

/**
 * API-key middleware (§13.6–13.7): only ki_-prefixed bearer tokens are
 * intercepted, so anonymous reads stay CDN-cached and the env-token
 * /revalidate check is untouched. A presented key must be live, in quota,
 * and scoped for the route; catalog reads require `catalog:read`.
 */
api.use(async (c, next) => {
  const header = c.req.header("authorization")
  const token = header?.startsWith("Bearer ki_") ? header.slice(7) : null
  if (token !== null) {
    if (!process.env.DATABASE_URL)
      fail(
        401,
        "KEYS_UNSUPPORTED",
        "API keys need a database-backed deployment",
      )
    const { verifyApiKey } = await import("../api-keys.ts")
    const result = await verifyApiKey(token)
    if (!result.ok) {
      if (result.reason === "quota") {
        const now = new Date()
        const midnight = Date.UTC(
          now.getUTCFullYear(),
          now.getUTCMonth(),
          now.getUTCDate() + 1,
        )
        fail(429, "QUOTA_EXCEEDED", "daily request quota exhausted", {
          "Retry-After": String(Math.ceil((midnight - now.getTime()) / 1000)),
        })
      }
      fail(401, "INVALID_API_KEY", `API key ${result.reason}`)
    }
    const path = new URL(c.req.url).pathname
    if (
      !path.endsWith("/me") &&
      !path.endsWith("/corrections") &&
      !path.endsWith("/revalidate") &&
      !result.identity.scopes.includes("catalog:read")
    )
      fail(403, "MISSING_SCOPE", "this route requires the catalog:read scope")
    c.set("apiKey", result.identity)
  }
  await next()
})

// Key introspection (§13.6): the one key-mandatory route; private, never
// cached. `ki auth status` consumes it.
api.openapi(
  createRoute({
    method: "get",
    path: "/me",
    security: [{ apiKey: [] }],
    responses: {
      200: {
        description: "The presented API key's identity, scopes, and quota",
        content: { "application/json": { schema: meResponse } },
      },
      401: {
        description: "No API key presented",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    const identity = c.get("apiKey")
    if (!identity) fail(401, "API_KEY_REQUIRED", "send an API key bearer token")
    const { listApiKeys } = await import("../api-keys.ts")
    const keys = await listApiKeys(identity.userId)
    const key = keys.find((row) => row.id === identity.keyId)
    c.header("Cache-Control", "private, no-store")
    return c.json(
      {
        keyId: identity.keyId,
        scopes: identity.scopes,
        name: key?.name ?? null,
        usedToday: key?.usedToday ?? null,
        quotaPerDay: key?.quotaPerDay ?? null,
      },
      200,
    )
  },
)

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

// Dossier responses reuse the page models verbatim; the wire schemas in
// schemas.ts mirror them with drift gates, so the SDK types every route.
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
    responses: json(
      operationDossier,
      "Operation dossier (the web page's model)",
    ),
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
    responses: json(implementationDossier, "Implementation dossier"),
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
    responses: json(runDossier, "Immutable run evidence dossier"),
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
              runs: z.array(z.string().max(200)).min(2).max(8),
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

// Versioned immutable export (§13.2): redirect to the latest snapshot. The
// pointer is a build-time import — the export workflow commits it, the push
// deploys — because a cwd-relative read escapes the traced bundle on Vercel.
api.openapi(
  createRoute({
    method: "get",
    path: "/exports/catalog.jsonl.zst",
    responses: {
      302: { description: "Redirect to the latest immutable catalog export" },
      404: {
        description: "No export generated yet",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    try {
      const pointer = await import(
        "../../../../../registry/exports/latest.json"
      )
      return c.redirect(pointer.default.url, 302)
    } catch {
      fail(
        404,
        "EXPORT_NOT_AVAILABLE",
        "no catalog export has been generated yet",
      )
    }
  },
)

// §10.7 corrections (Week 6): maintainer-only retraction and supersession
// through the append-only write path; the session cookie authorizes.
api.openapi(
  createRoute({
    method: "post",
    path: "/corrections",
    description:
      "Retract a run or mark it superseded (site_admin session required).",
    request: {
      body: { content: { "application/json": { schema: correctionRequest } } },
    },
    responses: {
      200: {
        description: "The applied correction",
        content: { "application/json": { schema: correctionResponse } },
      },
      403: {
        description: "Not a site admin",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    c.header("Cache-Control", "private, no-store")
    const { sessionUser, canCorrectRuns } = await import(
      "../policy/authorization.ts"
    )
    const user = await sessionUser(c.req.raw.headers)
    if (user === null || !canCorrectRuns(user)) {
      fail(403, "FORBIDDEN", "correcting runs requires the site_admin role")
    }
    const body = c.req.valid("json")
    const { db } = await import("../db/client.ts")
    const corrections = await import("../catalog/corrections.ts")
    const actor = { id: user.id, name: user.name }
    const result =
      body.action === "retract"
        ? await corrections.retractRun(db(), {
            runId: body.runId,
            reason: body.reason,
            actor,
          })
        : await corrections.markSuperseded(db(), {
            originalRunId: body.supersedesRunId ?? body.runId,
            supersedingRunId: body.runId,
            reason: body.reason,
            actor,
          })
    revalidateTag("catalog", "max")
    return c.json(result, 200)
  },
)

// §10.8 step 9: the importer calls this after publishing so caches drop
// immediately instead of waiting out the revalidate window.
api.openapi(
  createRoute({
    method: "post",
    path: "/revalidate",
    description: "Drop catalog caches (importer bearer token required).",
    responses: {
      200: {
        description: "Caches dropped",
        content: {
          "application/json": {
            schema: z.object({ revalidated: z.literal(true), at: z.string() }),
          },
        },
      },
      401: {
        description: "Missing or invalid token",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  (c) => {
    const token = process.env.REVALIDATE_TOKEN
    if (!token || c.req.header("authorization") !== `Bearer ${token}`) {
      fail(401, "UNAUTHORIZED", "missing or invalid token")
    }
    revalidateTag("catalog", "max")
    return c.json(
      { revalidated: true as const, at: new Date().toISOString() },
      200,
    )
  },
)

/** One info block for the runtime doc route and the generated snapshot, so
 * the committed openapi.json can never drift from what the API serves. */
export const OPENAPI_INFO = {
  openapi: "3.1.0",
  info: {
    title: "KernelIndex API",
    version: "v1",
    description:
      "Public read API over the KernelIndex catalog. Responses carry stable IDs, content digests, canonical units, and the ranking policy version; the web pages, CLI, and MCP render these same semantic results.",
  },
} as const

// Serving routes (§13.2 Week 9): explicit objective or Pareto frontier,
// never a universal score, never mixed with kernel cohorts. The §21.8
// kill switch turns the whole surface into 404s.
const servingGate = async () => {
  const { servingEnabled } = await import("../env.ts")
  if (!servingEnabled) fail(404, "SERVING_DISABLED", "serving catalog is off")
}

api.openapi(
  createRoute({
    method: "post",
    path: "/resolve/serving",
    request: {
      body: {
        content: { "application/json": { schema: resolveServingRequest } },
      },
    },
    responses: json(
      servingResolveResponse,
      "Feasible serving configurations grouped by cohort, ranked only under an explicit objective; the Pareto frontier otherwise",
    ),
  }),
  async (c) => {
    await servingGate()
    const model = await resolveServing(c.req.valid("json"))
    c.header("Cache-Control", CACHE_SHORT)
    return c.json(model)
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/serving-runs",
    request: {
      query: z.object({
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    },
    responses: json(servingRunsResponse, "Serving runs, cursor-paginated"),
  }),
  async (c) => {
    await servingGate()
    const { cursor, limit } = c.req.valid("query")
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(await listServingRuns({ cursor, limit }))
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/serving-configurations",
    responses: json(
      z.array(servingConfigurationSummary),
      "Serving configurations with eligible run counts",
    ),
  }),
  async (c) => {
    await servingGate()
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(await listServingConfigurations())
  },
)

api.openapi(
  createRoute({
    method: "get",
    path: "/serving-runs/{id}",
    request: { params: z.object({ id: z.string().max(200) }) },
    responses: json(servingRunDossier, "Serving run evidence dossier"),
  }),
  async (c) => {
    await servingGate()
    const model = await getServingRunPage(c.req.valid("param").id)
    if (!model) fail(404, "SERVING_RUN_NOT_FOUND", "no such serving run")
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(model)
  },
)

// Corpus enumeration routes (§13.2 at 20k records) live in their own module;
// mounting after the middleware keeps key/scope checks and CORS applied.
api.route("/", listRoutes)

api.doc("/openapi.json", OPENAPI_INFO)

api.notFound(() => fail(404, "NOT_FOUND", "no such route"))
api.onError((error, c) => {
  if (error instanceof HTTPException) return error.getResponse()
  console.error(c.req.path, error)
  return new Response(JSON.stringify({ status: 500, code: "INTERNAL" }), {
    status: 500,
    headers: { "Content-Type": "application/problem+json" },
  })
})
