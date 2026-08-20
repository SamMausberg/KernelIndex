// Shared HTTP grammar for the /api/v1 route modules: RFC 9457 failures,
// the JSON-response helper, and the CDN cache profiles (§13.5, §16).
import type { z } from "@hono/zod-openapi"
import { HTTPException } from "hono/http-exception"
import { problemDetails } from "./schemas.ts"

export const CACHE_SHORT = "public, s-maxage=60, stale-while-revalidate=300"
export const CACHE_MEDIUM = "public, s-maxage=300, stale-while-revalidate=86400"

/** RFC 9457 Problem Details thrown as an HTTPException (§13.5). */
export function fail(
  status: 400 | 401 | 403 | 404 | 422 | 429,
  code: string,
  detail: string,
  headers?: Record<string, string>,
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
      headers: { "Content-Type": "application/problem+json", ...headers },
    }),
  })
}

export const problemResponses = {
  404: {
    description: "Not found",
    content: { "application/json": { schema: problemDetails } },
  },
} as const

/** 200-with-problems response map for a route definition. */
export function json<S extends z.ZodType>(schema: S, description: string) {
  return {
    200: { description, content: { "application/json": { schema } } },
    ...problemResponses,
  }
}
