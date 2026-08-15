import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import {
  allRecordEvents,
  RecordsLedger,
  type RecordsView,
  recentlyBroken,
  recordsHref,
} from "@/features/records/ledger"
import { getRecordsPage } from "@/lib/catalog"

export const metadata: Metadata = { title: "Records" }

const VIEWS: { key: RecordsView; label: string }[] = [
  { key: "current", label: "Current records" },
  { key: "broken", label: "Recently broken" },
  { key: "history", label: "Record history" },
]

type Params = {
  view?: string
  hw?: string
  verified?: string
  f?: string
  sort?: string
  page?: string
}

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const params = await searchParams
  const model = await getRecordsPage()
  const page = Number.parseInt(params.page ?? "1", 10)
  const filters = {
    view: VIEWS.some((view) => view.key === params.view)
      ? (params.view as RecordsView)
      : ("current" as const),
    hardware:
      params.hw && model.hardwareOptions.includes(params.hw) ? params.hw : null,
    verified: params.verified === "1",
    filter: (params.f ?? "").trim(),
    sort:
      params.sort === "operation" ? ("operation" as const) : ("date" as const),
    page: Number.isNaN(page) ? 1 : page,
  }

  const events = allRecordEvents(model)
  const counts: Record<RecordsView, number> = {
    current: model.records.length,
    broken: recentlyBroken(events).length,
    history: events.length,
  }
  const operations = new Set(
    model.records.map((holder) => holder.operation.slug),
  ).size
  const context =
    model.records.length > 0
      ? [
          `${model.records.length} records`,
          `${operations} operations`,
          ...model.hardwareOptions.map(
            (hardware) =>
              `${model.records.filter((holder) => holder.hardware === hardware).length} on ${hardware}`,
          ),
        ].join(" · ")
      : undefined

  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Performance records"
        context={context}
        meta={VIEWS.map((view) => (
          <Link
            key={view.key}
            href={recordsHref(filters, { view: view.key })}
            className={`transition-colors hover:text-fg hover:no-underline ${
              filters.view === view.key ? "text-fg" : "text-subtle"
            }`}
          >
            {view.label}{" "}
            <span className="font-mono text-[11px] text-faint">
              {counts[view.key]}
            </span>
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
