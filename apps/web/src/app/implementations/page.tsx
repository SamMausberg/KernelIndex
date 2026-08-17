// Projects index (§16.4): every software project's standing — records
// held, evidence ceiling, licensing, availability — so "should I adopt X
// or Y" starts from facts. Standing is never a cross-cohort ranking; the
// order is corpus presence (run count), stated as such.
import type { Metadata } from "next"
import Link from "next/link"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { getProjectIndex } from "@/lib/catalog"
import { evidenceLabel, formatDateShort } from "@/lib/format"

export const metadata: Metadata = { title: "Projects" }
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(220px,1.6fr)_88px_88px_88px_120px_minmax(140px,1fr)_minmax(150px,1.1fr)_110px] items-baseline gap-x-4 min-w-[1080px]"

export default async function ProjectsPage() {
  const model = await getProjectIndex()
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <div className="scan-line" />
      <ContextHeader
        title="Projects"
        context="standing per project · records held · licensing · availability"
      />
      <main className="shell animate-fade-in pb-20">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} border-b border-border-strong pb-2 text-[11.5px] text-faint`}
          >
            <div>Project</div>
            <div className="text-right">Kernels</div>
            <div className="text-right">Runs</div>
            <div className="text-right">Records</div>
            <div>Best evidence</div>
            <div>License</div>
            <div>Hardware</div>
            <div className="text-right">Last observed</div>
          </div>
          {model.projects.map((project) => (
            <div
              key={project.slug}
              className={`${GRID} border-b border-line py-3 transition-colors hover:bg-raised`}
            >
              <div className="min-w-0 truncate">
                {project.repositoryUrl ? (
                  <a href={project.repositoryUrl} className="text-[13px]">
                    {project.name}
                  </a>
                ) : (
                  <span className="text-[13px] text-fg">{project.name}</span>
                )}
              </div>
              <div className="text-right font-mono text-[12.5px] text-muted">
                {project.implementations.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-[12.5px] text-muted">
                {project.runs.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-[12.5px] text-fg">
                {project.records.toLocaleString("en-US")}
              </div>
              <div className="text-[12px] text-subtle">
                {evidenceLabel(project.bestEvidence)}
              </div>
              <div className="min-w-0 truncate font-mono text-[11.5px] text-subtle">
                {project.licenses.length > 0
                  ? project.licenses.join(", ")
                  : "unknown"}
              </div>
              <div className="min-w-0 truncate font-mono text-[11.5px] text-subtle">
                {project.hardware.join(", ")}
              </div>
              <div className="text-right font-mono text-[11.5px] text-faint">
                {formatDateShort(project.lastObservedAt)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-faint">
          Ordered by corpus presence, not merit: results are comparable only
          inside cohorts. <Link href="/docs#comparability">Why? →</Link>
        </p>
      </main>
    </>
  )
}
