import Link from "next/link"
import { SiteHeader } from "@/components/site-header"

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <div className="h-px origin-left animate-scan bg-accent" />
      <main className="shell pt-24 pb-32">
        <div className="font-mono text-[10px] tracking-[0.08em] text-faint uppercase">
          Not found
        </div>
        <h1 className="mt-3 text-[28px] leading-tight font-medium tracking-[-0.015em]">
          There's nothing at this address.
        </h1>
        <p className="mt-3 max-w-[52ch] text-[14px] text-muted">
          The identifier may have been retired, superseded, or never existed.
          Published evidence is never deleted — if a run once lived here, its
          successor links back to it.
        </p>
        <div className="mt-6 flex gap-5 text-[13.5px]">
          <Link href="/search">Search the index</Link>
          <Link href="/records">Records</Link>
          <Link href="/">Home</Link>
        </div>
      </main>
    </>
  )
}
