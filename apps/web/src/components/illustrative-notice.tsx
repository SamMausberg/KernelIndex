/**
 * Required whenever a page renders fixture-backed models (§27.5): fixture
 * numbers are fictional and must never read as real benchmark evidence.
 * Neutral by design — a standing fact about the corpus, not a warning, so
 * amber stays reserved for states the reader must act on (§16.16).
 */
export function IllustrativeNotice() {
  return (
    <div className="border-b border-border bg-surface">
      <p className="shell py-2 text-small text-subtle">
        <span className="mr-2.5 text-label text-faint uppercase">
          Example data
        </span>
        Every number on this page is fictional, not benchmark evidence.
      </p>
    </div>
  )
}
