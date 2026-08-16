// Identity (§13.6): Better Auth with GitHub OAuth only, sessions in
// PostgreSQL through the drizzle adapter. Initialization is lazy — fixture
// mode and unconfigured deployments stay read-only instead of failing —
// and KernelIndex authorization decisions never live in these tables.
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

export const authConfigured =
  Boolean(process.env.GITHUB_CLIENT_ID) &&
  Boolean(process.env.GITHUB_CLIENT_SECRET)

function createAuth() {
  return betterAuth({
    baseURL: process.env.SITE_ORIGIN ?? "http://localhost:3000",
    secret: process.env.AUTH_SECRET ?? "kernelindex-dev-only-secret",
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
    socialProviders: authConfigured
      ? {
          github: {
            clientId: process.env.GITHUB_CLIENT_ID as string,
            clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
          },
        }
      : undefined,
  })
}

let cached: ReturnType<typeof createAuth> | null = null

export function auth(): ReturnType<typeof createAuth> {
  cached ??= createAuth()
  return cached
}
