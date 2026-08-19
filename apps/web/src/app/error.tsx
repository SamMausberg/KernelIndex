"use client"

// Route error boundary in the visual system (§27.14). Digest only — never
// raw internals — plus a way forward.
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="shell pt-24 pb-24">
      <div className="font-mono text-label text-warning uppercase">Error</div>
      <h1 className="mt-3 text-display font-medium">
        This page failed to render.
      </h1>
      <p className="mt-3 max-w-[52ch] text-body text-muted">
        Nothing was lost — published evidence can't change. Try again, or go
        back to search.
        {error.digest && (
          <span className="mt-2 block font-mono text-small text-faint">
            reference {error.digest}
          </span>
        )}
      </p>
      <div className="mt-6 flex items-center gap-5 text-body">
        <button
          type="button"
          onClick={reset}
          className="key cursor-pointer px-3 py-1.5 text-body text-fg"
        >
          Try again
        </button>
        <a href="/search">Search the index</a>
      </div>
    </main>
  )
}
