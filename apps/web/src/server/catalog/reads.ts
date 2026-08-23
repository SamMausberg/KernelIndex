// The catalog read seam's PostgreSQL entry point (§27.5): a barrel over the
// per-surface read modules, presenting the same interface as the fixtures
// backend. The page readers live beside it:
//
//   run-rows.ts        shared joined-run projections and ResultRow assembly
//                      (internals: siblings import it directly, not via here)
//   cohorts.ts         grouping, cohort facts, and cohort-wide ranking
//   search-reads.ts    query resolution, chooser, bracketing (§12)
//   operation-reads.ts operation index and dossier (§16.5, §16.8)
//   implementation-reads.ts implementation dossier and mirrored source
//   run-page-reads.ts  run dossier (§16.7)
//   compare-reads.ts   aligned comparison (§16.11)
//   precedent-reads.ts transferability search (§12.8)
//   home-reads.ts      homepage and the memoized records ledger
export { getChallenges } from "./challenge-reads.ts"
export { getComparePage } from "./compare-reads.ts"
export * from "./coverage-reads.ts"
export { getFeed } from "./feed-reads.ts"
export { getHomePage, getRecordsPage } from "./home-reads.ts"
export { getImplementationPage } from "./implementation-reads.ts"
export { getModelIndex, getModelPage } from "./model-reads.ts"
export { getOperationIndex, getOperationPage } from "./operation-reads.ts"
export { findPrecedents } from "./precedent-reads.ts"
export { getRunPage } from "./run-page-reads.ts"
export { searchCatalog } from "./search-reads.ts"
// Serving reads (§8.16, Week 9) live in their own module; re-exported so
// the seam's dynamic import of this file satisfies one interface.
export * from "./serving-reads.ts"
export {
  getHardwareIndex,
  getHardwarePage,
  getProjectIndex,
  getProjectPage,
} from "./surfaces.ts"
