// GPU index (§16.4): the hardware axis of the catalog. Live per-model
// coverage — runs, operations, records — with each model's dossier a row
// away. Counts follow the same eligibility filter as every ranked surface.
import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { getHardwareIndex } from "@/lib/catalog"
import { formatDateShort } from "@/lib/format"

export const metadata: Metadata = { title: "GPUs" }
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(220px,1.6fr)_110px_repeat(3,96px)_110px] items-baseline gap-x-4 min-w-[760px]"

export default async function GpusPage() {
  const model = await getHardwareIndex()
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="GPUs"
        context="coverage per hardware model · records held · freshness"
      />
      <main className="shell animate-fade-in pb-20">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} border-b border-border-strong pb-2 text-[11.5px] text-faint`}
          >
            <div>GPU</div>
            <div>Architecture</div>
            <div className="text-right">Runs</div>
            <div className="text-right">Operations</div>
            <div className="text-right">Records</div>
            <div className="text-right">Last observed</div>
          </div>
          {model.gpus.map((gpu) => (
            <div
              key={gpu.slug}
              className={`${GRID} border-b border-line py-3 transition-colors hover:bg-raised`}
            >
              <div className="min-w-0 truncate">
                <Link
                  href={`/gpus/${gpu.slug}`}
                  prefetch={false}
                  className="text-[13px]"
                >
                  {gpu.model}
                </Link>
              </div>
              <div className="font-mono text-[12px] text-subtle">
                {gpu.architecture ?? "—"}
              </div>
              <div className="text-right font-mono text-[12.5px] text-muted">
                {gpu.runs.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-[12.5px] text-muted">
                {gpu.operations.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-[12.5px] text-fg">
                {gpu.records.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-[11.5px] text-faint">
                {formatDateShort(gpu.lastObservedAt)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-faint">
          Coverage follows the imported sources; absence of a GPU here is not
          evidence about its performance.{" "}
          <Link href="/coverage">Coverage and limitations →</Link>
        </p>
      </main>
    </>
  )
}
