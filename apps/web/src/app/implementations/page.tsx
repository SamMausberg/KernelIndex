// Projects index (§16.4): every software project's standing — records
// held, evidence ceiling, licensing, availability — so "should I adopt X
// or Y" starts from facts. Standing is never a cross-cohort ranking; the
// order is corpus presence (run count), stated as such.
import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { getProjectIndex } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC } from "@/lib/format"

export const metadata: Metadata = { title: "Projects" }
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_80px_80px_90px_130px_minmax(150px,1fr)_minmax(180px,1.2fr)_110px] gap-x-6 min-w-[1160px]"

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
      <main className="shell animate-fade-in pt-7 pb-24">
        <div className="overflow-x-auto">
          <div
            className={`${GRID} items-baseline border-b border-border-strong pb-3 text-mini text-faint`}
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
              className={`${GRID} row-cv h-12 items-center border-b border-line transition-colors hover:bg-raised`}
            >
              <div className="min-w-0 truncate">
                {project.repositoryUrl ? (
                  <a href={project.repositoryUrl} className="text-body">
                    {project.name}
                  </a>
                ) : (
                  <span className="text-body text-fg">{project.name}</span>
                )}
              </div>
              <div className="text-right font-mono text-small text-muted">
                {project.implementations.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-small text-muted">
                {project.runs.toLocaleString("en-US")}
              </div>
              <div className="text-right font-mono text-small text-fg">
                {project.records.toLocaleString("en-US")}
              </div>
              <div className="text-small text-subtle">
                {evidenceLabel(project.bestEvidence)}
              </div>
              <div className="min-w-0 truncate font-mono text-mini text-subtle">
                {project.licenses.length > 0
                  ? project.licenses.join(", ")
                  : "unknown"}
              </div>
              <div className="min-w-0 truncate font-mono text-mini text-subtle">
                {project.hardware.join(", ")}
              </div>
              <div className="text-right font-mono text-mini text-faint">
                {formatDateUTC(project.lastObservedAt)}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-small text-faint">
          Ordered by corpus presence, not merit: results are comparable only
          inside cohorts. <Link href="/docs#comparability">Why? →</Link>
        </p>
      </main>
    </>
  )
}
