// One Zod-parsed environment boundary (§27.7). Deep modules receive
// configuration; they do not read process.env arbitrarily.
import { z } from "zod"

const environmentSchema = z
  .object({
    CATALOG_BACKEND: z.enum(["fixtures", "postgres"]).default("fixtures"),
    DATABASE_URL: z.url().optional(),
    DATABASE_DIRECT_URL: z.url().optional(),
    SITE_ORIGIN: z.url().optional(),
    RELEASE_SHA: z.string().optional(),
  })
  .refine(
    (env) =>
      env.CATALOG_BACKEND !== "postgres" || env.DATABASE_URL !== undefined,
    {
      message: "CATALOG_BACKEND=postgres requires DATABASE_URL",
    },
  )
  .refine(
    (env) =>
      process.env.VERCEL_ENV !== "production" ||
      env.CATALOG_BACKEND === "postgres",
    {
      message:
        "Production must explicitly select CATALOG_BACKEND=postgres — fixture mode cannot be enabled silently in production (§22.3 gate)",
    },
  )

export const env = environmentSchema.parse(process.env)

/** Non-sensitive release identity for the diagnostics footer (§27.11). */
export const releaseSha =
  env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null
