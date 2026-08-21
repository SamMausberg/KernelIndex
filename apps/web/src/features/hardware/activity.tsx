import type { RecordHolder } from "@/lib/catalog"

/**
 * Record activity on one GPU (§16.4 dashboard): record transitions per month
 * over the trailing year, from the same ledger histories the records table
 * renders. Static column strip — length carries the value, the printed count
 * carries the identity; nothing repaints.
 */
export function MonthlyActivity({ records }: { records: RecordHolder[] }) {
  const now = new Date()
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11 + index, 1),
    )
    return {
      key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
      label: date.toLocaleString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      count: 0,
    }
  })
  const byKey = new Map(months.map((month) => [month.key, month]))
  for (const holder of records)
    for (const event of holder.history) {
      const bucket = byKey.get(event.at.slice(0, 7))
      if (bucket) bucket.count += 1
    }
  const max = Math.max(...months.map((month) => month.count))
  if (max === 0)
    return (
      <p className="py-2 text-body text-faint">
        No record transitions on this GPU in the trailing year.
      </p>
    )
  return (
    <div className="flex max-w-[720px] items-end gap-2 overflow-x-auto">
      {months.map((month) => (
        <div key={month.key} className="flex min-w-[40px] flex-1 flex-col">
          <span className="text-center font-mono text-mini text-subtle">
            {month.count > 0 ? month.count : ""}
          </span>
          <span
            className="mt-1 block w-full"
            style={{
              height: `${Math.round((month.count / max) * 48)}px`,
              background:
                month.count > 0 ? "var(--color-viz-1)" : "transparent",
            }}
          />
          <span className="mt-1.5 border-t border-line pt-1 text-center font-mono text-mini text-faint">
            {month.label}
          </span>
        </div>
      ))}
    </div>
  )
}
