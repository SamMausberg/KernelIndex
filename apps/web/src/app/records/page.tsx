// Records (§16.12): ISR — the server renders the default slice from CDN
// cache, and the island applies any deep-linked filters after loading the
// full model. Filters never make this page dynamic.
import type { Metadata } from "next"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { RecordsLedger } from "@/features/records/ledger"
import {
  DEFAULT_FILTERS,
  ledgerSlice,
  slimModel,
  slimSlice,
} from "@/features/records/ledger-model"
import { getRecordsPage } from "@/lib/catalog"

export const metadata: Metadata = {
  title: "Records",
  description:
    "The GPU kernel performance record ledger: current record holders per workload cohort, recently broken records, and the full record history.",
  alternates: { canonical: "/records" },
}
export const revalidate = 300

export default async function RecordsPage() {
  const model = await getRecordsPage()
  const slice = slimSlice(ledgerSlice(slimModel(model), DEFAULT_FILTERS))
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <RecordsLedger initial={slice} />
    </>
  )
}
