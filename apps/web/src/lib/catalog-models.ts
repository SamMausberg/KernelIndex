// Page-oriented read models returned by the catalog read functions (see
// lib/catalog.ts). Fixture and PostgreSQL backends implement these same
// shapes, so pages never know which backend produced a model.
//
// Derived from ENGINEERING_DESIGN.md §16.6–16.10 and §27.5. Field additions
// are expected while the site is being designed; removals are breaking.
//
//   models/rows.ts     vocabulary and row primitives (ResultRow, cohorts)
//   models/pages.ts    page models: search, records, dossiers, compare
//   models/listings.ts coverage, hardware, models, enumeration, projects
//   models/precedents.ts precedent search (§12.8)
export type * from "./models/listings.ts"
export type * from "./models/pages.ts"
export type * from "./models/precedents.ts"
export type * from "./models/rows.ts"
