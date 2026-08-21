/**
 * Required whenever a page renders fixture-backed models (§27.5): fixture
 * numbers are fictional and must never read as real benchmark evidence.
 */
export function IllustrativeNotice() {
  return (
    <div className="border-b border-border bg-surface">
      <p className="shell py-2 text-small text-warning">
        Example data. Every number on this page is fictional, not benchmark
        evidence.
      </p>
    </div>
  )
}
