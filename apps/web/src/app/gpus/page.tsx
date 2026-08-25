// GPU index (§16.4): the hardware axis of the catalog. Live per-model
// coverage — runs and records — with each model's dossier a row away.
// Counts follow the same eligibility filter as every ranked surface; the
// priority family×GPU gap grid lives on /challenges, the gaps board.
import type { Metadata } from "next"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { getHardwareIndex } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"

export const metadata: Metadata = {
  title: "GPUs",
  description:
    "GPU kernel benchmark coverage per hardware model: runs indexed, records held, and freshness, with each GPU's dossier one row away.",
  alternates: { canonical: "/gpus" },
}
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(240px,1.6fr)_130px_repeat(2,110px)_130px] gap-x-6 min-w-[780px]"

export default async function GpusPage() {
  const model = await getHardwareIndex()
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="GPUs"
        context="runs indexed and records held per hardware model"
      />
      <main className="shell pt-7 pb-24">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} items-baseline border-b border-border-strong pb-3 font-mono text-label text-faint uppercase`}
          >
            <div>GPU</div>
            <div>Architecture</div>
            <div className="text-right">Runs</div>
            <div className="text-right">Records</div>
            <div className="text-right">Last observed</div>
          </div>
          {model.gpus.map((gpu) => (
            <div
              key={gpu.slug}
              className={`${GRID} h-12 items-center border-b border-line transition-colors hover:bg-raised`}
            >
              <div className="min-w-0 truncate">
                <Link
                  href={`/gpus/${gpu.slug}`}
                  prefetch={false}
                  className="text-body"
                >
                  {gpu.model}
                </Link>
              </div>
              <div className="font-mono text-small text-subtle">
                {gpu.architecture ?? "—"}
              </div>
              <div className="text-right font-mono text-small text-muted">
                {gpu.runs.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-small text-fg">
                {gpu.records.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-mini text-faint">
                {formatDateUTC(gpu.lastObservedAt)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-small text-faint">
          Coverage follows the imported sources; absence of a GPU here is not
          evidence about its performance.{" "}
          <Link href="/docs#sources">Sources and limitations →</Link>{" "}
          <ApiLink path="/hardware" />
        </p>
      </main>
    </>
  )
}
