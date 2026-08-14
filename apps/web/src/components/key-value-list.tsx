import type { KeyValue } from "@/lib/catalog-models"

/** Quiet two-column fact list: labels subtle, values mono and readable. */
export function KeyValueList({ items }: { items: KeyValue[] }) {
  return (
    <div>
      {items.map((item) => (
        <div
          key={item.key}
          className="flex justify-between gap-4 border-b border-line py-[6px] text-[12.5px]"
        >
          <span className="text-subtle">{item.key}</span>
          <span className="text-right font-mono text-[12px] break-all text-muted">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  )
}
