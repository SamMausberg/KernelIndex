// Corpus enumeration routes (§13.2 at 20k records): flat, filterable GET
// listings over the same read seam the pages use — agents page the corpus
// instead of guessing slugs. Mounted into the /api/v1 app (app.ts), so the
// key middleware, CORS, and Problem-Details error handling apply.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import {
  getChallenges,
  getCoveragePage,
  getFeed,
  getModelPage,
  listHardwareCoverage,
  listModelCoverage,
  listOperations,
  listRuns,
} from "../../lib/catalog.ts"
import { CACHE_MEDIUM, CACHE_SHORT, fail, json } from "./http.ts"
import {
  challengesResponse,
  coverageResponse,
  feedResponse,
  hardwareResponse,
  modelDossier,
  modelsResponse,
  operationsResponse,
  problemDetails,
  runStatus,
  runsResponse,
  sourcesResponse,
} from "./schemas.ts"

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** /runs cursor grammar: base64url("observedAtISO runId"), encoded by the
 * listRuns read. Malformed cursors are a 400, never a silent restart. */
function decodeRunCursor(raw: string) {
  const [at, id] = Buffer.from(raw, "base64url").toString().split(" ")
  return at !== undefined &&
    id !== undefined &&
    UUID_PATTERN.test(id) &&
    !Number.isNaN(Date.parse(at))
    ? { observedAt: at, id }
    : null
}

export const listRoutes = new OpenAPIHono()

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/runs",
    request: {
      query: z.object({
        operation: z.string().max(200).optional(),
        hardware: z.string().max(200).optional(),
        source: z.string().max(200).optional(),
        // Default surface is the pages' eligibility filter; an explicit
        // status widens to any published, unretracted run of that status.
        status: runStatus.optional(),
        since: z.iso.datetime({ offset: true }).optional(),
        cursor: z.string().max(200).optional(),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      }),
    },
    responses: {
      ...json(
        runsResponse,
        "Published runs, newest observation first, keyset-paginated",
      ),
      400: {
        description: "Invalid cursor",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    const { cursor: raw, ...filters } = c.req.valid("query")
    const cursor = raw === undefined ? undefined : decodeRunCursor(raw)
    if (cursor === null) fail(400, "INVALID_CURSOR", raw ?? "")
    c.header("Cache-Control", CACHE_SHORT)
    return c.json(await listRuns({ ...filters, cursor }), 200)
  },
)

// Challenges (§2.3): where the index has no good answer yet — the worklist
// for contributors and agents writing kernels.
listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/challenges",
    responses: json(
      challengesResponse,
      "Requested workloads, priority and model gaps, unbeaten baselines, unchallenged and stale records; every row points at the cohort or search where the answer would go",
    ),
  }),
  async (c) => {
    const model = await getChallenges()
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json({ ...model, generatedAt: new Date().toISOString() }, 200)
  },
)

// What the index learned (§13.11): the bulk change feed agents poll.
// `since` narrows to entries published after that instant.
listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/feed",
    request: {
      query: z.object({ since: z.iso.datetime({ offset: true }).optional() }),
    },
    responses: json(
      feedResponse,
      "Record breaks, publication batches, corrections, and accepted claims over the trailing 30 days, newest first, grouped by UTC day",
    ),
  }),
  async (c) => {
    const { since } = c.req.valid("query")
    const model = await getFeed()
    const floor = since === undefined ? null : new Date(since).toISOString()
    const days =
      floor === null
        ? model.days
        : model.days
            .map((day) => ({
              ...day,
              entries: day.entries.filter((entry) => entry.at > floor),
            }))
            .filter((day) => day.entries.length > 0)
    c.header("Cache-Control", CACHE_SHORT)
    return c.json(
      { ...model, days, generatedAt: new Date().toISOString() },
      200,
    )
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/operations",
    request: {
      query: z.object({
        family: z.string().max(100).optional(),
        tag: z.string().max(200).optional(),
      }),
    },
    responses: json(
      operationsResponse,
      "Every operation with taxonomy tags, workload count, and eligible run count",
    ),
  }),
  async (c) => {
    const operations = await listOperations(c.req.valid("query"))
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json({ operations, generatedAt: new Date().toISOString() }, 200)
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/hardware",
    responses: json(
      hardwareResponse,
      "Per-GPU coverage: kernel and serving run counts and operation-family breadth (counts, never a shared ranking)",
    ),
  }),
  async (c) => {
    const hardware = await listHardwareCoverage()
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json({ hardware, generatedAt: new Date().toISOString() }, 200)
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/models",
    responses: json(
      modelsResponse,
      "Model coverage: serving model revisions and kernel-side model: tags, as separate arrays",
    ),
  }),
  async (c) => {
    const model = await listModelCoverage()
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json({ ...model, generatedAt: new Date().toISOString() }, 200)
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/models/{slug}",
    request: {
      params: z.object({ slug: z.string().max(200) }),
      query: z.object({ gpu: z.string().max(200).optional() }),
    },
    responses: {
      ...json(
        modelDossier,
        "Model dossier: best known per operation on one GPU, gaps, evidence, source links (the web page's model)",
      ),
      404: {
        description: "Unknown model slug",
        content: { "application/json": { schema: problemDetails } },
      },
    },
  }),
  async (c) => {
    const { slug } = c.req.valid("param")
    const { gpu } = c.req.valid("query")
    const model = await getModelPage(slug, gpu)
    if (!model) fail(404, "MODEL_NOT_FOUND", slug)
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(model, 200)
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/coverage",
    responses: json(
      coverageResponse,
      "Live per-source corpus counts and the hero family/GPU coverage grid",
    ),
  }),
  async (c) => {
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json(await getCoveragePage(), 200)
  },
)

listRoutes.openapi(
  createRoute({
    method: "get",
    path: "/sources",
    responses: json(
      sourcesResponse,
      "Source provenance: slug, kind, run counts, and last snapshot fetch time",
    ),
  }),
  async (c) => {
    // The coverage read already aggregates per-source counts; share it.
    const { sources } = await getCoveragePage()
    c.header("Cache-Control", CACHE_MEDIUM)
    return c.json({ sources, generatedAt: new Date().toISOString() }, 200)
  },
)
