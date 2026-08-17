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
    <main className="shell pt-24 pb-32">
      <div className="font-mono text-[10px] tracking-[0.08em] text-warning uppercase">
        Error
      </div>
      <h1 className="mt-3 text-[28px] leading-tight font-medium tracking-[-0.015em]">
        This page failed to render.
      </h1>
      <p className="mt-3 max-w-[52ch] text-[14px] text-muted">
        Nothing was lost — published evidence can't change. Try again, or go
        back to search.
        {error.digest && (
          <span className="mt-2 block font-mono text-[12px] text-faint">
            reference {error.digest}
          </span>
        )}
      </p>
      <div className="mt-6 flex items-center gap-5 text-[13.5px]">
        <button
          type="button"
          onClick={reset}
          className="key cursor-pointer px-3 py-1.5 text-[13px] text-fg"
        >
          Try again
        </button>
        <a href="/search">Search the index</a>
      </div>
    </main>
  )
}
