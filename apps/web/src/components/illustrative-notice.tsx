/**
 * Required whenever a page renders fixture-backed models (§27.5): fixture
 * numbers are fictional and must never read as real benchmark evidence.
 */
export function IllustrativeNotice() {
  return (
    <div className="border-b border-border bg-surface">
      <p className="mx-auto max-w-[1220px] px-8 py-2 text-[12.5px] text-warning">
        Illustrative fixture data — every number on this page is fictional and
        is not benchmark evidence.
      </p>
    </div>
  )
}
