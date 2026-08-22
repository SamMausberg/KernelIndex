import { CopyButton } from "@/components/copy-button"
import { Link } from "@/components/quiet-link"
import type { ResultRow } from "@/lib/catalog"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatPrimaryParts,
  formatRelative,
  formatSolScore,
  formatSpread,
} from "@/lib/format"
import { deployability } from "@/server/policy/deployability"

/** One policy, one predicate (§11.8). */
export const isDeployable = (row: ResultRow) =>
  deployability({
    sourceAvailable: row.sourceAvailable,
    installable: row.installable,
    licenseConcluded: row.license.concluded,
  }).eligible

/** Answer heading tracks the evidence actually present — never upgraded. */
export function answerLabel(row: ResultRow) {
  if (row.evidence === "verified" || row.evidence === "replicated")
    return "Fastest verified"
  if (row.evidence === "reproducible") return "Fastest reproducible"
  return "Fastest reported"
}

/** The house ratio notation ("1.07× vs fastest"); null when the comparison
 * is degenerate (missing metrics, zero, or not actually slower). */
export function deltaVsFastest(row: ResultRow, fastest: ResultRow) {
  if (!row.primary || !fastest.primary || fastest.primary.value <= 0)
    return null
  const ratio = row.primary.value / fastest.primary.value
  return ratio > 1 ? `${ratio.toFixed(2)}× vs fastest` : null
}

function Slot({
  label,
  row,
  delta,
  vsBaseline,
}: {
  label: string
  row: ResultRow
  delta?: string | null
  vsBaseline?: number | null
}) {
  const parts = row.primary ? formatPrimaryParts(row.primary) : null
  const meta = row.primary
    ? [
        formatSpread(row.primary),
        row.primary.statistic === "unspecified"
          ? null
          : `${row.primary.statistic}${row.primary.sampleCount ? ` of ${row.primary.sampleCount}` : ""}`,
        row.solScore !== null ? formatSolScore(row.solScore) : null,
        // Prose ratios always state the direction (§16.7 wording); bare
        // multiples belong to ranking cells only.
        vsBaseline == null
          ? null
          : vsBaseline >= 1
            ? `${vsBaseline.toFixed(2)}× faster than baseline`
            : `${(1 / vsBaseline).toFixed(2)}× slower than baseline`,
        delta,
      ]
        .filter(Boolean)
        .join(" · ")
    : null
  return (
    <div className="min-w-0">
      <div className="font-mono text-label text-faint uppercase">{label}</div>
      <div className="mt-3 flex flex-wrap items-baseline gap-4">
        <span className="font-mono text-readout font-medium">
          {parts?.value ?? "—"}
          {parts && (
            <span className="ml-1.5 text-title font-normal text-subtle">
              {parts.unit}
            </span>
          )}
        </span>
        {meta && (
          <span className="font-mono text-body text-subtle">{meta}</span>
        )}
      </div>
      <div className="mt-3">
        <Link
          href={`/implementations/${row.implementation.slug}`}
          className="text-lead font-medium"
        >
          {row.implementation.name}
        </Link>
        <span className="ml-2.5 text-body text-subtle">
          {[
            row.project.name === row.implementation.name
              ? null
              : row.project.name,
            row.license.concluded ?? row.license.declared ?? "License unknown",
            row.language,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <p className="mt-2 max-w-[64ch] text-body text-muted">
        {evidenceLabel(row.evidence)} evidence · last observed{" "}
        {formatDateUTC(row.lastTestedAt)}.
        {row.caveats.length > 0 ? ` ${row.caveats.join(". ")}.` : ""}
      </p>
      {row.install ? (
        <div className="plate mt-4 flex max-w-[520px] items-center gap-2.5 py-2 pr-2 pl-3">
          <code className="min-w-0 flex-1 truncate font-mono text-small text-muted">
            {row.install.command}
          </code>
          <CopyButton text={row.install.command} event="install_copied" />
        </div>
      ) : row.sourceAvailable ? (
        <p className="mt-4 text-small text-subtle">
          No package.{" "}
          <Link
            href={`/implementations/${row.implementation.slug}#use`}
            className="text-small"
          >
            Vendor the source from the kernel page →
          </Link>
        </p>
      ) : (
        <p className="mt-4 text-small text-faint">
          No public source for this result.
        </p>
      )}
      <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-1">
        {row.sourceAvailable && (
          <Link
            href={`/implementations/${row.implementation.slug}#code`}
            className="action"
          >
            View source →
          </Link>
        )}
        {row.runId && (
          <Link href={`/runs/${row.runId}`} className="action">
            Run detail →
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * The answer, not a ranking (§16.6): the fastest known result and, when it
 * differs, the fastest one that passes the deployability policy — as peer
 * slots with the gap stated. One slot when they coincide.
 */
export function AnswerSlots({
  top,
  topLabel,
  deploy,
  vsBaseline,
}: {
  top: ResultRow
  /** Search states evidence tier ("Fastest verified"); default derives it. */
  topLabel?: string
  /** The fastest deployable row, when it isn't `top` itself. */
  deploy: ResultRow | null
  vsBaseline?: number | null
}) {
  const label = topLabel ?? answerLabel(top)
  if (deploy === null) {
    return (
      <Slot
        label={isDeployable(top) ? `${label} · deployable` : label}
        row={top}
        vsBaseline={vsBaseline}
      />
    )
  }
  return (
    <div className="grid grid-cols-2 gap-10 max-lg:grid-cols-1">
      <Slot label={label} row={top} vsBaseline={vsBaseline} />
      <div className="border-l border-border pl-9 max-lg:border-l-0 max-lg:pl-0">
        <Slot
          label="Fastest you can deploy"
          row={deploy}
          delta={deltaVsFastest(deploy, top)}
        />
      </div>
    </div>
  )
}

/** The fastest ranked row per language inside one cohort (§16.6), in rank
 * order; empty unless at least two languages compete. Rows unknown to any
 * language never count. */
export function byLanguage(rows: ResultRow[]): [string, ResultRow][] {
  const first = new Map<string, ResultRow>()
  for (const row of rows) {
    const language = row.language
    if (row.rank === null || !language || language === "unknown") continue
    if (!first.has(language)) first.set(language, row)
  }
  return first.size >= 2 ? [...first] : []
}

/** One quiet line under the answer: "triton · name · 41.2 µs · 1.12×",
 * multiples against the cohort leader, which reads #1. */
export function ByLanguage({ rows }: { rows: ResultRow[] }) {
  const entries = byLanguage(rows)
  if (entries.length === 0) return null
  const leader = entries[0][1]
  return (
    <p className="mt-4 flex flex-wrap items-baseline gap-x-5 gap-y-1">
      <span className="font-mono text-label text-faint uppercase">
        Fastest by language
      </span>
      {entries.map(([language, row]) => (
        <span key={language} className="font-mono text-small text-subtle">
          {language} ·{" "}
          <Link
            href={`/implementations/${row.implementation.slug}`}
            className="text-small"
          >
            {row.implementation.name}
          </Link>
          {row.primary && (
            <>
              {" · "}
              <span className="text-fg">{formatPrimary(row.primary)}</span>
              {" · "}
              {row.runId === leader.runId
                ? "#1"
                : formatRelative(row.primary, leader.primary)}
            </>
          )}
        </span>
      ))}
    </p>
  )
}
