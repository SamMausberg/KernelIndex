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

export const env = environmentSchema.parse(process.env)
