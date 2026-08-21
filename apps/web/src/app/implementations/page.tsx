// Projects index (§16.4): every software project's standing — records
// held, evidence ceiling, licensing, availability — so "should I adopt X
// or Y" starts from facts. Libraries lead; competition authors are their
// own group (projects.kind), never interleaved with adoptable software.
// Standing is never a cross-cohort ranking; the order is corpus presence
// (run count), stated as such.
import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { getProjectIndex, type ProjectIndexEntry } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC } from "@/lib/format"

export const metadata: Metadata = { title: "Projects" }
export const revalidate = 300

const GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_80px_80px_90px_minmax(190px,1.1fr)_minmax(180px,1.2fr)_110px] gap-x-6 min-w-[1060px]"

// SSR row cap (§16 payload budget): the tail of the authors group is
// hundreds of one-submission contest identities; every project past the cap
// stays reachable from its implementations' pages, and the cut is stated.
const AUTHOR_CAP = 100

function ProjectRow({ project }: { project: ProjectIndexEntry }) {
  return (
    <div
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
      <div className="min-w-0 truncate text-small text-subtle">
        {evidenceLabel(project.bestEvidence)}
        {" · "}
        {project.licenses.length > 0 ? (
          <span className="font-mono text-mini">
            {project.licenses.join(", ")}
          </span>
        ) : (
          <span className="text-faint">license unknown</span>
        )}
      </div>
      <div className="min-w-0 truncate font-mono text-mini text-subtle">
        {project.hardware.join(", ")}
      </div>
      <div className="text-right font-mono text-mini text-faint">
        {formatDateUTC(project.lastObservedAt)}
      </div>
    </div>
  )
}

function TableHead() {
  return (
    <div
      className={`${GRID} items-baseline border-b border-border-strong pb-3 font-mono text-label text-faint uppercase`}
    >
      <div>Project</div>
      <div className="text-right">Kernels</div>
      <div className="text-right">Runs</div>
      <div className="text-right">Records</div>
      <div>Trust</div>
      <div>Hardware</div>
      <div className="text-right">Last observed</div>
    </div>
  )
}

export default async function ProjectsPage() {
  const model = await getProjectIndex()
  const libraries = model.projects.filter((p) => p.kind === "library")
  const authors = model.projects
    .filter((p) => p.kind === "individual")
    .slice(0, AUTHOR_CAP)
  const authorTotal = model.projects.filter(
    (p) => p.kind === "individual",
  ).length
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Projects"
        context="standing per project · records held · licensing · availability"
      />
      <main className="shell animate-fade-in pb-24">
        <Section id="libraries" title="Libraries">
          <p className="mb-4 max-w-[76ch] text-body text-muted">
            Software you can adopt: real projects with a repository, a license
            conclusion, and benchmark evidence behind each row.
          </p>
          <div className="overflow-x-auto">
            <TableHead />
            {libraries.map((project) => (
              <ProjectRow key={project.slug} project={project} />
            ))}
          </div>
        </Section>

        {authors.length > 0 && (
          <Section id="authors" title="Competition authors">
            <p className="mb-4 max-w-[76ch] text-body text-muted">
              Individual entrants from GPU MODE, SOL-ExecBench, and
              FlashInfer-Bench. Their results rank inside the same cohorts; they
              just aren't packages you can install.
            </p>
            <div className="overflow-x-auto">
              <TableHead />
              <ExpandRows
                cap={10}
                noun="authors"
                rows={authors.map((project) => (
                  <ProjectRow key={project.slug} project={project} />
                ))}
              />
            </div>
            {authorTotal > AUTHOR_CAP && (
              <p className="mt-3 text-small text-faint">
                Showing the {AUTHOR_CAP} most present of {authorTotal} authors;
                the rest are reachable from their kernels' pages.
              </p>
            )}
          </Section>
        )}

        <p className="mt-8 text-small text-faint">
          Ordered by corpus presence, not merit: results are comparable only
          inside cohorts. <Link href="/docs#comparability">Why? →</Link>
        </p>
      </main>
    </>
  )
}
