import { Link } from "@/components/quiet-link"

/**
 * The two resolver modes as quiet tabs at the top of the shared band:
 * kernel search and the serving resolver stay separate corpora on separate
 * URLs (§8.16 — they never share a ranking), but read as one instrument
 * with two modes. Renders nothing when serving is disabled.
 */
export function ResolverTabs({
  mode,
  serving,
}: {
  mode: "kernels" | "serving"
  serving: boolean
}) {
  if (!serving) return null
  const tab = (href: string, label: string, on: boolean) => (
    <Link
      href={href}
      className={`whitespace-nowrap no-underline transition-colors ${
        on ? "font-medium text-fg" : "text-faint hover:text-fg"
      }`}
    >
      {label}
    </Link>
  )
  return (
    <div className="mb-2.5 flex items-baseline gap-5 text-small">
      {tab("/search", "Kernels", mode === "kernels")}
      {tab("/serving", "Serving", mode === "serving")}
    </div>
  )
}
