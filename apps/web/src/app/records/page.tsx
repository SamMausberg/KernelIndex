import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { SiteHeader } from "@/components/site-header"
import {
  RecordsLedger,
  type RecordsView,
  recordsHref,
} from "@/features/records/ledger"
import { getRecordsPage } from "@/lib/catalog"

export const metadata: Metadata = { title: "Records" }

const VIEWS: { key: RecordsView; label: string }[] = [
  { key: "current", label: "Current records" },
  { key: "broken", label: "Recently broken" },
  { key: "history", label: "Record history" },
]

type Params = { view?: string; hw?: string; verified?: string }

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const model = await getRecordsPage()
  const filters = {
    view: VIEWS.some((view) => view.key === params.view)
      ? (params.view as RecordsView)
      : ("current" as const),
    hardware:
      params.hw && model.hardwareOptions.includes(params.hw) ? params.hw : null,
    verified: params.verified === "1",
  }
  return (
    <>
      <SiteHeader active="records" />
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Performance records"
        meta={VIEWS.map((view) => (
          <Link
            key={view.key}
            href={recordsHref(filters, { view: view.key })}
            className={`transition-colors hover:text-fg hover:no-underline ${
              filters.view === view.key ? "text-fg" : "text-subtle"
            }`}
          >
            {view.label}
          </Link>
        ))}
      >
        <p className="mt-1.5 text-[13px] text-subtle">
          A record exists only inside an exactly comparable cohort: one
          workload, protocol, and environment at a time. There is no global
          fastest kernel.
        </p>
      </ContextHeader>
      <RecordsLedger model={model} filters={filters} />
    </>
  )
}
