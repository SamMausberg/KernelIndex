// Identity (§13.6): Better Auth with GitHub OAuth (primary — project claims
// verify repository ownership) and optionally Google for watchers and
// reporters, sessions in PostgreSQL through the drizzle adapter.
// Initialization is lazy — fixture mode and unconfigured deployments stay
// read-only instead of failing — and KernelIndex authorization decisions
// never live in these tables.
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"
import { env } from "./env.ts"

function configuredEnvironment() {
  if (
    !env.SITE_ORIGIN ||
    !env.DATABASE_URL ||
    !env.AUTH_SECRET ||
    !env.GITHUB_CLIENT_ID ||
    !env.GITHUB_CLIENT_SECRET
  )
    return null
  return {
    baseURL: env.SITE_ORIGIN,
    secret: env.AUTH_SECRET,
    githubClientId: env.GITHUB_CLIENT_ID,
    githubClientSecret: env.GITHUB_CLIENT_SECRET,
    google:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          }
        : null,
  }
}

const authEnvironment = configuredEnvironment()
export const authConfigured = authEnvironment !== null
export const googleEnabled = authEnvironment?.google != null

function createAuth() {
  if (!authEnvironment) throw new Error("Authentication is not configured")
  return betterAuth({
    baseURL: authEnvironment.baseURL,
    secret: authEnvironment.secret,
    database: drizzleAdapter(db(), {
      provider: "pg",
      // With usePlural the adapter resolves models by their plural names,
      // so the schema keys must be plural too.
      schema: {
        users: schema.users,
        sessions: schema.sessions,
        accounts: schema.accounts,
        verifications: schema.verifications,
      },
      usePlural: true,
    }),
    account: { encryptOAuthTokens: true },
    socialProviders: {
      github: {
        clientId: authEnvironment.githubClientId,
        clientSecret: authEnvironment.githubClientSecret,
      },
      ...(authEnvironment.google ? { google: authEnvironment.google } : {}),
    },
  })
}

let cached: ReturnType<typeof createAuth> | null = null

export function auth(): ReturnType<typeof createAuth> {
  cached ??= createAuth()
  return cached
}
