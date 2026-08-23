// The selection-dependent slice of an operation page: what changes when the
// visitor picks a workload or hardware cohort. The ISR page renders the
// default variant; /operations/[slug]/data serves the others CDN-cached and
// the island swaps them client-side (records-island pattern, §16.12).
import type {
  CohortContext,
  OperationPageModel,
  OperationSweep,
  ResultRow,
} from "@/lib/catalog"

/** Rows rendered in the records table; the deep tail lives in search, which
 * paginates. Rendering every row made 900KB pages. */
export const RECORDS_CAP = 60

export type OperationVariant = {
  selectedWorkloadId: string | null
  cohortOptions: OperationPageModel["cohortOptions"]
  cohort: CohortContext | null
  records: ResultRow[]
  recordsTotal: number
  sweep: OperationSweep | null
  headroom: OperationPageModel["headroom"]
}

export function operationVariant(model: OperationPageModel): OperationVariant {
  return {
    selectedWorkloadId: model.selectedWorkloadId,
    cohortOptions: model.cohortOptions,
    cohort: model.cohort,
    records: model.records.slice(0, RECORDS_CAP),
    recordsTotal: model.records.length,
    sweep: model.sweep,
    headroom: model.headroom,
  }
}
