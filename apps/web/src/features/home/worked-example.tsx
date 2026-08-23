import { Link } from "@/components/quiet-link"
import { isDeployable } from "@/features/answer/answer-slots"
import { getOperationIndex, searchCatalog } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC, formatPrimaryParts } from "@/lib/format"
import { HERO_FAMILIES } from "@/lib/priority"

/**
 * The homepage's one worked example (§16.5): a real workload resolved to a
 * real answer, straight from the live resolver — never a fixture number.
 * Picks the most-measured operation among the hero families so the first
 * thing a visitor reads is an outcome ("your workload → use this"), not a
 * leaderboard. Renders nothing when the corpus can't answer honestly.
 */
export async function WorkedExample() {
  const index = await getOperationIndex()
  const pick = index
    .filter((entry) => HERO_FAMILIES.includes(entry.family) && entry.runs > 0)
    .sort((a, b) => b.runs - a.runs)[0]
  if (!pick) return null
  const model = await searchCatalog({ query: `op:${pick.slug}` })
  const exact = model.groups.exact
  const top = exact.find(isDeployable) ?? exact[0]
  if (!top?.primary || !model.operation) return null

  // Same baseline framing as the search hero: state the ratio only when a
  // source baseline exists in the cohort and the answer actually beats it.
  const baseline = exact.find((row) => row.baseline) ?? null
  const speedup =
    !top.baseline && baseline?.primary && top.primary.value > 0
      ? baseline.primary.value / top.primary.value
      : null
  const parts = formatPrimaryParts(top.primary)
  const facts = model.cohort?.facts ?? []
  const workload = ["GPU", "Workload"]
    .map((key) => facts.find((fact) => fact.key === key)?.value)
    .filter(Boolean)
    .join(" · ")

  return (
    <div className="mt-7 max-w-[620px] border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-label text-faint uppercase">
          Example
        </span>
        <Link
          href={`/search?q=${encodeURIComponent(`op:${pick.slug}`)}`}
          className="font-mono text-small text-subtle"
        >
          {model.operation.name}
          {workload && ` · ${workload}`}
        </Link>
      </div>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Link
          href={`/implementations/${top.implementation.slug}`}
          className="text-lead font-medium"
        >
          {top.implementation.name}
        </Link>
        <span className="font-mono text-lead font-medium text-fg">
          {parts.value}
          <span className="ml-1 text-body font-normal text-subtle">
            {parts.unit}
          </span>
        </span>
        {speedup !== null && speedup > 1 && (
          <span className="font-mono text-small text-subtle">
            {speedup.toFixed(2)}× faster than baseline
          </span>
        )}
        <Link
          href={`/implementations/${top.implementation.slug}#use`}
          className="text-body"
        >
          Use it →
        </Link>
      </p>
      <p className="mt-1.5 text-small text-faint">
        {evidenceLabel(top.evidence)} evidence
        {top.lastTestedAt && ` · observed ${formatDateUTC(top.lastTestedAt)}`}
        {" · "}
        {top.license.concluded ?? top.license.declared ?? "license unknown"}
      </p>
    </div>
  )
}
