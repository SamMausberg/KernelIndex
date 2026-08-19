// Workload selection on the operation page (§16.6). A handful of workloads
// stays the familiar inline chip row; a large case sweep becomes an aligned
// numeric table — constant axes stated once, varying axes as sorted columns,
// suites listed beneath — bounded by its own scroll region.
import { Link } from "@/components/quiet-link"
import type { WorkloadOption } from "@/lib/catalog"
import { dtypeLabel } from "@/lib/format"

const INLINE_LIMIT = 8

function ChipRow({
  workloads,
  selectedId,
  slug,
}: {
  workloads: WorkloadOption[]
  selectedId: string | null
  slug: string
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-small">
      <span className="mr-1 text-faint">Workload</span>
      {workloads.map((option) => (
        <Link
          key={option.id}
          href={`/operations/${slug}?workload=${option.id}`}
          className={`key font-mono text-small whitespace-nowrap hover:no-underline ${
            option.id === selectedId ? "key-on" : "text-subtle hover:text-fg"
          }`}
        >
          {option.label}
        </Link>
      ))}
    </div>
  )
}

export function WorkloadPicker({
  workloads,
  selectedId,
  slug,
}: {
  workloads: WorkloadOption[]
  selectedId: string | null
  slug: string
}) {
  if (workloads.length <= 1) return null
  const cases = workloads.filter(
    (option) => Object.keys(option.axes).length > 0,
  )
  const suites = workloads.filter(
    (option) => Object.keys(option.axes).length === 0,
  )
  const names = [
    ...new Set(cases.flatMap((option) => Object.keys(option.axes))),
  ]
  const distinct = new Map(
    names.map((name) => [
      name,
      new Set(cases.map((option) => String(option.axes[name]))).size,
    ]),
  )
  // Most-varying axes first make the sweep scannable; seed is bookkeeping
  // and goes last; axes constant across the sweep are stated once above.
  const columns = names
    .filter((name) => (distinct.get(name) ?? 0) > 1 && name !== "seed")
    .sort(
      (a, b) =>
        (distinct.get(b) as number) - (distinct.get(a) as number) ||
        a.localeCompare(b),
    )
  if (names.includes("seed") && (distinct.get("seed") ?? 0) > 1) {
    columns.push("seed")
  }
  if (workloads.length <= INLINE_LIMIT || columns.length === 0) {
    return <ChipRow workloads={workloads} selectedId={selectedId} slug={slug} />
  }

  const constants = names.filter((name) => (distinct.get(name) ?? 0) === 1)
  const constantLine = constants
    .map((name) => `${name} = ${cases[0].axes[name]}`)
    .join(" · ")
  const numeric = (option: WorkloadOption, name: string) =>
    Number(option.axes[name] ?? Number.NEGATIVE_INFINITY)
  const rows = [...cases].sort((a, b) => {
    for (const name of columns) {
      const delta = numeric(a, name) - numeric(b, name)
      if (delta !== 0) return delta
    }
    return 0
  })
  // Columns flex so the table fills its panel instead of huddling left;
  // 92px floors keep the numerals aligned when space is tight.
  const template = `repeat(${columns.length}, minmax(92px, 1fr)) minmax(110px, 1fr)`

  const selected = workloads.find((option) => option.id === selectedId)
  return (
    <div className="mb-3 text-small">
      {/* The case sweep collapses behind the selection line: the results
          table is the page's answer and must not sit under a wall of case
          numbers (§16.8 hierarchy). */}
      <details className="group/picker">
        <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-x-5 gap-y-1.5 [&::-webkit-details-marker]:hidden">
          <span className="text-faint">Workload</span>
          {selected && (
            <span className="font-mono text-small text-muted">
              {selected.label}
            </span>
          )}
          {constantLine && (
            <span className="font-mono text-small text-faint">
              {constantLine}
            </span>
          )}
          <span className="font-mono text-small text-subtle">
            {rows.length} cases{" "}
            <span
              aria-hidden="true"
              className="inline-block transition-transform group-open/picker:rotate-90"
            >
              ›
            </span>
          </span>
        </summary>
        <div className="mt-2 w-full rounded-md border border-border">
          <div className="max-h-[300px] overflow-auto">
            <div
              className="sticky top-0 grid border-b border-border-strong bg-surface"
              style={{ gridTemplateColumns: template }}
            >
              {columns.map((name) => (
                <div
                  key={name}
                  className="px-3.5 py-1.5 text-right font-mono text-label text-faint uppercase"
                >
                  {name}
                </div>
              ))}
              <div className="px-3.5 py-1.5 font-mono text-label text-faint uppercase">
                dtype
              </div>
            </div>
            {rows.map((option) => (
              <Link
                key={option.id}
                href={`/operations/${slug}?workload=${option.id}`}
                className={`grid border-b border-line font-mono text-small transition-colors last:border-b-0 hover:bg-raised hover:no-underline ${
                  option.id === selectedId
                    ? "text-accent"
                    : "text-subtle hover:text-fg"
                }`}
                style={{ gridTemplateColumns: template }}
              >
                {columns.map((name) => (
                  <span key={name} className="px-3.5 py-1 text-right">
                    {String(option.axes[name] ?? "—")}
                  </span>
                ))}
                <span className="px-3.5 py-1">
                  {option.dtypes.length > 0 ? dtypeLabel(option.dtypes) : "—"}
                </span>
              </Link>
            ))}
          </div>
          {rows.length > 12 && (
            <div className="border-t border-border px-3.5 py-1 font-mono text-mini text-faint">
              scrolls · {rows.length} cases total
            </div>
          )}
        </div>
      </details>
      {suites.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-faint">Aggregates</span>
          {suites.map((option) => (
            <Link
              key={option.id}
              href={`/operations/${slug}?workload=${option.id}`}
              className={`key font-mono text-small whitespace-nowrap hover:no-underline ${
                option.id === selectedId
                  ? "key-on"
                  : "text-subtle hover:text-fg"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
