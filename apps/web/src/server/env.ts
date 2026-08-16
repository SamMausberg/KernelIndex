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
    /** Pinned nvidia/sol-execbench commit for `import:sol --snapshot`
        solutions (§22.15); unpinned solutions are skipped for review. */
    SOL_EXAMPLES_COMMIT: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
    /** §21.8 kill switch: "false" hides nav/pages/API/sitemap for serving. */
    SERVING_CATALOG_ENABLED: z.string().optional(),
    AUTH_SECRET: z.string().min(32).optional(),
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
  .refine(
    (env) =>
      process.env.VERCEL_ENV !== "production" || env.AUTH_SECRET !== undefined,
    {
      message:
        "Production requires an explicit AUTH_SECRET (≥32 chars) — the dev literal must never sign production sessions (§18.2)",
    },
  )

export const env = environmentSchema.parse(process.env)

/** Non-sensitive release identity for the diagnostics footer (§27.11). */
export const releaseSha =
  env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null

/** Serving surfaces default on; the flag is a kill switch, not a rollout. */
export const servingEnabled = env.SERVING_CATALOG_ENABLED !== "false"
