// Wire schemas for /api/v1 (§13.2–13.3): a barrel over the per-surface
// schema modules. Every schema mirrors its catalog read model through a
// `satisfies z.ZodType<…>` constraint, so the API contract and the web
// models cannot drift apart (§22.6 gate).
//
//   schemas/results.ts  result rows, resolver envelope, records, feed,
//                       challenges, submissions, problem details
//   schemas/serving.ts  serving resolution and listings (§12.7)
//   schemas/dossiers.ts operation/implementation/project/run dossiers
//   schemas/listings.ts corpus enumeration, coverage, /me, corrections
export * from "./schemas/dossiers.ts"
export * from "./schemas/listings.ts"
export * from "./schemas/results.ts"
export * from "./schemas/serving.ts"
