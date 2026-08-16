import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { RecordsLedger } from "@/features/records/ledger"
import {
  ledgerSlice,
  type RecordsSort,
  type RecordsView,
} from "@/features/records/ledger-model"
import { getRecordsPage } from "@/lib/catalog"

export const metadata: Metadata = { title: "Records" }

type Params = {
  view?: string
  hw?: string
  verified?: string
  source?: string
  f?: string
  sort?: string
  page?: string
}

const VIEWS = new Set<RecordsView>(["current", "broken", "history"])
const SORTS = new Set<RecordsSort>([
  "date",
  "improvement",
  "leads",
  "operation",
])

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const model = await getRecordsPage()
  const page = Number.parseInt(params.page ?? "1", 10)
  const slice = ledgerSlice(model, {
    view: VIEWS.has(params.view as RecordsView)
      ? (params.view as RecordsView)
      : "current",
    hardware:
      params.hw && model.hardwareOptions.includes(params.hw) ? params.hw : null,
    verified: params.verified === "1",
    // Source-backed records are the default; source=0 widens to all.
    source: params.source !== "0",
    filter: (params.f ?? "").trim(),
    sort: SORTS.has(params.sort as RecordsSort)
      ? (params.sort as RecordsSort)
      : "date",
    page: Number.isNaN(page) ? 1 : page,
  })

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <RecordsLedger initial={slice} />
    </>
  )
}
