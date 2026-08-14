// Shared primitives for canonical manifest schemas (§9.1–9.2).
// Everything here either validates strictly or normalizes an authoring
// convenience into one canonical representation; ambiguous input is rejected.
import { z } from "zod"

/** Content digest format used everywhere (§10.5). */
export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/

export const digestString = z
  .string()
  .regex(DIGEST_PATTERN, "expected sha256:<64 lowercase hex>")

/** Lowercase machine token: dtypes, metrics, statistics, generators. */
export const token = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, "expected lowercase token")

/** Public URL-safe slug. */
export const slug = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*$/, "expected lowercase kebab-case slug")
  .max(100)

/** Manifest object name: slug characters plus dots and underscores. */
export const manifestName = z
  .string()
  .regex(/^[a-z0-9][a-z0-9._-]*$/, "expected lowercase name")
  .max(200)

/** Symbolic axis reference in a shape expression (tiny grammar, §9.1). */
export const axisName = z.string().regex(/^[a-z][a-z0-9_]*$/)

/** A shape dimension: a bound integer or a symbolic axis reference. */
export const dimension = z.union([z.int().nonnegative(), axisName])

export const layout = z.enum([
  "row_major",
  "col_major",
  "contiguous",
  "strided",
])

export const httpsUrl = z
  .string()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === "https:"
    } catch {
      return false
    }
  }, "expected an https URL")

export const gitCommit = z
  .string()
  .regex(/^[0-9a-f]{40}$/, "expected a full lowercase commit SHA")

/** Immutable artifact reference: never a bare mutable URL (§9.1). */
export const artifactRef = z.strictObject({
  uri: z.string().max(2000),
  digest: digestString,
})

/** UTC instant; offsets are rejected so one instant has one representation. */
export const utcInstant = z.iso.datetime()

const DURATION_UNIT_NS: Record<string, number> = {
  ns: 1,
  us: 1e3,
  µs: 1e3,
  ms: 1e6,
  s: 1e9,
}

/**
 * Duration normalized to integer nanoseconds (§9.2 step 3). Accepts an
 * integer nanosecond count or a string such as "0.008 ms"; a conversion that
 * does not land on an integer nanosecond is ambiguous and rejected.
 */
export const durationNs = z
  .union([
    z.int().nonnegative(),
    z
      .string()
      .regex(
        /^\d+(\.\d+)?\s?(ns|us|µs|ms|s)$/,
        "expected '<number> ns|us|ms|s'",
      ),
  ])
  .transform((value, ctx) => {
    if (typeof value === "number") return value
    const match = value.match(/^(\d+(?:\.\d+)?)\s?(ns|us|µs|ms|s)$/)
    if (!match) throw new Error("unreachable: regex-validated duration")
    const ns = Number(match[1]) * DURATION_UNIT_NS[match[2]]
    if (!Number.isSafeInteger(ns)) {
      ctx.addIssue({
        code: "custom",
        message: `ambiguous duration: ${value} is not an integer nanosecond count`,
      })
      return z.NEVER
    }
    return ns
  })

/** Sorted, deduplicated normalization for set-like lists (§9.2 step 4). */
export function setLike<T extends z.ZodType<string>>(item: T) {
  return z
    .array(item)
    .transform((values) =>
      [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    )
}
