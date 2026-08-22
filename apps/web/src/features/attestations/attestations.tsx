import type { Attestation } from "@/lib/catalog"
import { formatDateUTC, formatLatency } from "@/lib/format"

export const ATTESTATION_LABELS: Record<Attestation["type"], string> = {
  reproduced: "reproduced",
  could_not_reproduce: "could not reproduce",
  environment_note: "environment note",
  regression_observed: "regression observed",
}

/** The run page's Replications rows (§16.10): typed, one paragraph each,
 * the attester's measurement beside the type, evidence as a link. */
export function AttestationList({ rows }: { rows: Attestation[] }) {
  if (rows.length === 0)
    return <p className="text-body text-faint">No attestations yet.</p>
  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1)
  return (
    <>
      <p className="mb-1 font-mono text-small text-subtle">
        {[...counts]
          .map(
            ([type, n]) =>
              `${n} ${ATTESTATION_LABELS[type as Attestation["type"]]}`,
          )
          .join(" · ")}
      </p>
      {rows.map((row) => (
        <div key={row.id} className="border-b border-line py-2.5 text-body">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="key text-mini text-subtle">
              {ATTESTATION_LABELS[row.type]}
            </span>
            {row.observedNs !== null && (
              <span className="font-mono text-small text-fg">
                {formatLatency(row.observedNs)}
              </span>
            )}
            {row.environmentSummary && (
              <span className="font-mono text-small text-subtle">
                {row.environmentSummary}
              </span>
            )}
            <span className="ml-auto font-mono text-mini text-faint">
              {row.author} · {formatDateUTC(row.at)}
            </span>
          </div>
          <p className="mt-1.5 max-w-[96ch] whitespace-pre-wrap text-small text-muted">
            {row.body}
          </p>
          {row.evidenceUrl && (
            <a href={row.evidenceUrl} className="text-small">
              evidence →
            </a>
          )}
        </div>
      ))}
    </>
  )
}
