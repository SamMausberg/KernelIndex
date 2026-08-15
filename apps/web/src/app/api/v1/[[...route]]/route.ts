// /api/v1 mount (§27.10): one optional catch-all binding the Hono app into
// the web deployment. Handlers call the read seam directly — no loopback.

import { OpenAPIHono } from "@hono/zod-openapi"
import { handle } from "hono/vercel"
import { api } from "@/server/api/app"

const app = new OpenAPIHono().basePath("/api/v1").route("/", api)

export const GET = handle(app)
export const POST = handle(app)
