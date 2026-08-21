import Link from "next/link"

export default function NotFound() {
  return (
    <main className="shell pt-24 pb-24">
      <div className="font-mono text-label text-faint uppercase">Not found</div>
      <h1 className="mt-3 text-display font-medium">
        There's nothing at this address.
      </h1>
      <p className="mt-3 max-w-[52ch] text-body text-muted">
        This ID may have been superseded, or never existed. Evidence is never
        deleted; if a run lived here, its successor links back to it.
      </p>
      <div className="mt-6 flex gap-5 text-body">
        <Link href="/search">Search the index</Link>
        <Link href="/records">Records</Link>
        <Link href="/">Home</Link>
      </div>
    </main>
  )
}
