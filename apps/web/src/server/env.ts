// One Zod-parsed environment boundary (§27.7). Deep modules receive
// configuration; they do not read process.env arbitrarily.
import { z } from "zod"

const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional())

export const environmentSchema = z
  .object({
    VERCEL_ENV: optional(z.enum(["production", "preview", "development"])),
    CATALOG_BACKEND: z.enum(["fixtures", "postgres"]).default("fixtures"),
    DATABASE_URL: optional(z.url()),
    DATABASE_DIRECT_URL: optional(z.url()),
    SITE_ORIGIN: optional(z.url()),
    RELEASE_SHA: optional(z.string()),
    /** Pinned nvidia/sol-execbench commit for `import:sol --snapshot`
        solutions (§22.15); unpinned solutions are skipped for review. */
    SOL_EXAMPLES_COMMIT: optional(z.string().regex(/^[0-9a-f]{40}$/)),
    /** §21.8 kill switch: "false" hides nav/pages/API/sitemap for serving. */
    SERVING_CATALOG_ENABLED: optional(z.string()),
    GITHUB_CLIENT_ID: optional(z.string().trim().min(1)),
    GITHUB_CLIENT_SECRET: optional(z.string().trim().min(1)),
    AUTH_SECRET: optional(z.string().min(32)),
    REVALIDATE_TOKEN: optional(z.string().min(32)),
  })
  .superRefine((env, context) => {
    const issue = (message: string) =>
      context.addIssue({ code: "custom", message })
    if (env.CATALOG_BACKEND === "postgres" && !env.DATABASE_URL)
      issue("CATALOG_BACKEND=postgres requires DATABASE_URL")
    if (env.VERCEL_ENV === "production") {
      if (env.CATALOG_BACKEND !== "postgres")
        issue("Production requires CATALOG_BACKEND=postgres")
      if (!env.AUTH_SECRET)
        issue("Production requires AUTH_SECRET (>=32 chars)")
    }

    const auth = [
      env.SITE_ORIGIN,
      env.DATABASE_URL,
      env.AUTH_SECRET,
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
    ]
    const authRequested = [
      env.SITE_ORIGIN,
      env.GITHUB_CLIENT_ID,
      env.GITHUB_CLIENT_SECRET,
    ].some(Boolean)
    if (authRequested && !auth.every(Boolean))
      issue(
        "Authentication requires SITE_ORIGIN, DATABASE_URL, AUTH_SECRET, GITHUB_CLIENT_ID, and GITHUB_CLIENT_SECRET together",
      )
    if (
      env.VERCEL_ENV === "production" &&
      env.SITE_ORIGIN &&
      new URL(env.SITE_ORIGIN).protocol !== "https:"
    )
      issue("Production SITE_ORIGIN must use https")
  })

export const env = environmentSchema.parse(process.env)

/** Non-sensitive release identity for the diagnostics footer (§27.11). */
export const releaseSha =
  env.RELEASE_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null

/** Serving surfaces default on; the flag is a kill switch, not a rollout. */
export const servingEnabled = env.SERVING_CATALOG_ENABLED !== "false"
