import { describe, expect, it } from "vitest"
import { environmentSchema } from "./env.ts"

const production = {
  VERCEL_ENV: "production",
  CATALOG_BACKEND: "postgres",
  DATABASE_URL: "postgres://user:password@example.com/kernelindex",
  SITE_ORIGIN: "https://kernelindex.com",
  AUTH_SECRET: "a".repeat(32),
  GITHUB_CLIENT_ID: "client-id",
  GITHUB_CLIENT_SECRET: "client-secret",
} as const

describe("environment configuration", () => {
  it("accepts a complete production auth configuration", () => {
    expect(environmentSchema.safeParse(production).success).toBe(true)
  })

  it("allows database-only test environments", () => {
    expect(
      environmentSchema.safeParse({
        DATABASE_URL: production.DATABASE_URL,
        SITE_ORIGIN: "",
        GITHUB_CLIENT_ID: "",
      }).success,
    ).toBe(true)
  })

  it("rejects partial auth configuration and weak production secrets", () => {
    expect(
      environmentSchema.safeParse({ GITHUB_CLIENT_ID: "client-id" }).success,
    ).toBe(false)
    expect(
      environmentSchema.safeParse({ ...production, AUTH_SECRET: "short" })
        .success,
    ).toBe(false)
  })

  it("google needs its full pair on top of a complete github setup", () => {
    expect(
      environmentSchema.safeParse({
        ...production,
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      }).success,
    ).toBe(true)
    expect(
      environmentSchema.safeParse({ ...production, GOOGLE_CLIENT_ID: "only" })
        .success,
    ).toBe(false)
    expect(
      environmentSchema.safeParse({
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      }).success,
    ).toBe(false)
  })

  it("requires an HTTPS production origin", () => {
    expect(
      environmentSchema.safeParse({
        ...production,
        SITE_ORIGIN: "http://kernelindex.com",
      }).success,
    ).toBe(false)
  })
})
