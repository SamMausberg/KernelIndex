// GPU index (§16.4): the hardware axis of the catalog. Live per-model
// coverage — runs, operations, records — with each model's dossier a row
// away, and the priority family×GPU grid stating gaps as gaps. Counts
// follow the same eligibility filter as every ranked surface.
import type { Metadata } from "next"
import { ApiLink } from "@/components/api-link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { getCoveragePage, getHardwareIndex } from "@/lib/catalog"
import { formatDateUTC } from "@/lib/format"

export const metadata: Metadata = { title: "GPUs" }
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(240px,1.6fr)_130px_repeat(3,110px)_130px] gap-x-6 min-w-[900px]"

export default async function GpusPage() {
  const [model, coverage] = await Promise.all([
    getHardwareIndex(),
    getCoveragePage(),
  ])
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="GPUs"
        context="coverage per hardware model · records held · freshness"
        meta={<ApiLink path="/hardware" />}
      />
      <main className="shell pt-7 pb-24">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} items-baseline border-b border-border-strong pb-3 font-mono text-label text-faint uppercase`}
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
              <div className="text-right font-mono text-small text-muted">
                {gpu.operations.toLocaleString("en-US")}
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
          <Link href="/docs#sources">Sources and limitations →</Link>
        </p>

        <Section id="priority" title="Priority coverage">
          <p className="mb-4 max-w-[76ch] text-body text-muted">
            The operations an inference engineer asks about first, on the GPUs
            they ask about first. Ranked runs per cell; a zero is a stated gap,
            not a claim.
          </p>
          <div className="overflow-x-auto">
            <div className="max-w-[720px] min-w-[560px]">
              <div className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-border-strong pb-2 font-mono text-label text-faint uppercase">
                <span>Family</span>
                {coverage.hero.gpus.map((gpu) => (
                  <span key={gpu} className="text-right">
                    {gpu.replace("NVIDIA ", "")}
                  </span>
                ))}
                <span className="text-right">All GPUs</span>
              </div>
              {coverage.hero.rows.map((row) => (
                <div
                  key={row.family}
                  className="grid grid-cols-[minmax(180px,1.4fr)_repeat(3,minmax(96px,0.6fr))] items-baseline gap-x-4 border-b border-line py-2.5 text-body"
                >
                  <Link
                    href={`/search?q=${encodeURIComponent(row.family)}`}
                    className="font-mono text-small"
                  >
                    {row.family}
                  </Link>
                  {row.runs.map((runs, index) => (
                    <span
                      key={coverage.hero.gpus[index]}
                      className="text-right font-mono text-small"
                    >
                      {runs === 0 ? (
                        // The board, not #gap: that section only renders when
                        // gap-kind challenges exist, so the fragment could
                        // land on nothing.
                        <Link
                          href="/challenges"
                          prefetch={false}
                          className="text-small text-faint"
                        >
                          0 · gap
                        </Link>
                      ) : (
                        runs.toLocaleString("en-US")
                      )}
                    </span>
                  ))}
                  <span className="text-right font-mono text-small text-subtle">
                    {row.total.toLocaleString("en-US")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      </main>
    </>
  )
}
