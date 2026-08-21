// Model index (§16.21): kernel-side `model:` workload provenance as a
// browse axis. Kernel tags and serving model revisions are separate lists
// with separate counts; they never share a ranking (§8.16). Each kernel row
// opens the model's dossier: best known per operation on a chosen GPU.
import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { getModelIndex } from "@/lib/catalog"
import { countNoun, formatDateUTC } from "@/lib/format"
import { servingEnabled } from "@/server/env"

export const metadata: Metadata = {
  title: "Models",
  description:
    "Model-aware GPU kernel coverage: for each model, the operations KernelIndex knows are relevant, with evidence counts per GPU and the best known implementations one row away.",
}
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(240px,1.5fr)_minmax(140px,1fr)_repeat(4,90px)_110px] gap-x-4 min-w-[940px]"
const SERVING_GRID =
  "grid grid-cols-[minmax(240px,1.6fr)_140px_90px] gap-x-4 min-w-[540px]"

/** "70B" from a raw parameter count; models without one stay quiet. */
function paramsLabel(count: number | null): string {
  if (count === null) return "—"
  if (count >= 1e12) return `${(count / 1e12).toFixed(1).replace(/\.0$/, "")}T`
  if (count >= 1e9) return `${(count / 1e9).toFixed(1).replace(/\.0$/, "")}B`
  return `${Math.round(count / 1e6)}M`
}

export default async function ModelsPage() {
  const model = await getModelIndex()
  const maxRuns = model.kernel[0]?.runs || 1
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Models"
        context="operation coverage per model · workload provenance declared by sources"
        meta={
          <span>
            {countNoun(model.kernel.length, "model")} with kernel evidence
            {servingEnabled &&
              ` · ${countNoun(model.serving.length, "serving model")}`}
          </span>
        }
      />
      <main className="shell animate-fade-in pt-7 pb-24">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} items-baseline border-b border-border-strong pb-3 font-mono text-label text-faint uppercase`}
          >
            <div>Model</div>
            <div />
            <div className="text-right">Operations</div>
            <div className="text-right">Families</div>
            <div className="text-right">Runs</div>
            <div className="text-right">GPUs</div>
            <div className="text-right">Last observed</div>
          </div>
          <ExpandRows
            cap={25}
            noun="models"
            rows={model.kernel.map((entry) => (
              <div
                key={entry.model}
                className={`${GRID} h-12 items-center border-b border-line transition-colors hover:bg-raised`}
              >
                <div className="min-w-0 truncate">
                  <Link
                    href={`/models/${entry.model}`}
                    prefetch={false}
                    className="font-mono text-body"
                  >
                    {entry.model}
                  </Link>
                </div>
                {/* Length carries the share (§16.2); the printed runs count
                    stays the record of fact. */}
                <div aria-hidden="true" className="flex items-center">
                  <span
                    className="block h-[9px]"
                    style={{
                      width: `${Math.max((entry.runs / maxRuns) * 100, entry.runs > 0 ? 1 : 0)}%`,
                      background: "var(--color-viz-1)",
                    }}
                  />
                </div>
                <div className="text-right font-mono text-small text-muted">
                  {entry.operations.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-small text-subtle">
                  {entry.families.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-small text-fg">
                  {entry.runs.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-small text-subtle">
                  {entry.gpus.toLocaleString("en-US")}
                </div>
                <div className="text-right font-mono text-mini text-faint">
                  {formatDateUTC(entry.lastObservedAt)}
                </div>
              </div>
            ))}
          />
        </div>
        <p className="mt-4 max-w-[76ch] text-small text-faint">
          Model relevance is workload provenance declared by the imported
          sources, not a completeness claim; an operation a model needs may
          simply not be indexed yet.{" "}
          <Link href="/docs#sources">Sources and limitations →</Link>
        </p>

        {servingEnabled && model.serving.length > 0 && (
          <Section id="serving" title="Serving models">
            <p className="mb-4 max-w-[76ch] text-body text-muted">
              End-to-end serving evidence is a separate corpus with its own
              resolver; these counts never mix with the kernel table above.
            </p>
            <div className="overflow-x-auto">
              <div
                className={`${SERVING_GRID} items-baseline border-b border-border-strong pb-2 font-mono text-label text-faint uppercase`}
              >
                <div>Model</div>
                <div className="text-right">Parameters</div>
                <div className="text-right">Runs</div>
              </div>
              <ExpandRows
                cap={12}
                noun="serving models"
                rows={model.serving.map((entry) => (
                  <div
                    key={entry.slug}
                    className={`${SERVING_GRID} h-12 items-center border-b border-line transition-colors hover:bg-raised`}
                  >
                    <div className="min-w-0 truncate">
                      <Link
                        href={`/serving?model=${encodeURIComponent(entry.slug)}`}
                        prefetch={false}
                        className="text-body"
                      >
                        {entry.name}
                      </Link>
                    </div>
                    <div className="text-right font-mono text-small text-subtle">
                      {paramsLabel(entry.parameterCount)}
                    </div>
                    <div className="text-right font-mono text-small text-muted">
                      {entry.runs.toLocaleString("en-US")}
                    </div>
                  </div>
                ))}
              />
            </div>
          </Section>
        )}
      </main>
    </>
  )
}
