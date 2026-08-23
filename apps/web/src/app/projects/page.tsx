// Projects index (§16.4): every software project's standing — records
// held, gained and lost, evidence ceiling, licensing, availability — so
// "should I adopt X or Y" and "who is winning" start from facts. Libraries
// lead; competition authors are their own group (projects.kind), never
// interleaved with adoptable software. Sorted by records held this is the
// standings surface (§16.12): records are counted inside their own cohorts
// and cohorts are never ranked against each other. Dynamic: the sort is
// the URL.
import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { ExpandRows } from "@/components/expand-rows"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import { getProjectIndex, type ProjectIndexEntry } from "@/lib/catalog"
import { evidenceLabel, formatDateUTC, formatInstantUTC } from "@/lib/format"

export const metadata: Metadata = { title: "Projects" }

const GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_72px_72px_82px_72px_72px_minmax(180px,1.1fr)_minmax(170px,1.2fr)_104px] gap-x-5 min-w-[1180px]"

// SSR row cap (§16 payload budget): the tail of the authors group is
// hundreds of one-submission contest identities; every project past the cap
// stays reachable from its implementations' pages, and the cut is stated.
const AUTHOR_CAP = 100

const SORTS = [
  { key: "presence", label: "Presence" },
  { key: "records", label: "Records held" },
  { key: "gained", label: "Gained 30d" },
] as const
type Sort = (typeof SORTS)[number]["key"]

function sorted(projects: ProjectIndexEntry[], sort: Sort) {
  const copy = [...projects]
  if (sort === "records")
    copy.sort((a, b) => b.records - a.records || b.runs - a.runs)
  if (sort === "gained")
    copy.sort((a, b) => b.gained30d - a.gained30d || b.records - a.records)
  return copy
}

function ProjectRow({ project }: { project: ProjectIndexEntry }) {
  return (
    <div
      className={`${GRID} row-cv h-12 items-center border-b border-line transition-colors hover:bg-raised`}
    >
      <div className="min-w-0 truncate">
        <Link
          href={`/projects/${project.slug}`}
          prefetch={false}
          className="text-body"
        >
          {project.name}
        </Link>
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
      <div
        className={`text-right font-mono text-small ${
          project.gained30d > 0 ? "text-success" : "text-faint"
        }`}
      >
        {project.gained30d > 0 ? `+${project.gained30d}` : "—"}
      </div>
      <div
        className={`text-right font-mono text-small ${
          project.lost30d > 0 ? "text-warning" : "text-faint"
        }`}
      >
        {project.lost30d > 0 ? `−${project.lost30d}` : "—"}
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
      <div className="text-right">Gained</div>
      <div className="text-right">Lost</div>
      <div>Trust</div>
      <div>Hardware</div>
      <div className="text-right">Last observed</div>
    </div>
  )
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>
}) {
  const { sort: requested } = await searchParams
  const sort: Sort =
    SORTS.find((option) => option.key === requested)?.key ?? "presence"
  const model = await getProjectIndex()
  const libraries = sorted(
    model.projects.filter((p) => p.kind === "library"),
    sort,
  )
  const authorsAll = sorted(
    model.projects.filter((p) => p.kind === "individual"),
    sort,
  )
  const authors = authorsAll.slice(0, AUTHOR_CAP)
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      <ContextHeader
        title="Projects"
        context="standing per project · records held inside their own cohorts · gained and lost over 30 days"
        meta={
          <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            {/* Same ledger as every project dossier, cached on its own ISR
                clock: the snapshot is what makes a few minutes' difference
                between the two record counts a fact, not a discrepancy. */}
            <span className="text-faint">
              records as of {formatInstantUTC(model.recordsAsOf)} · sorted by
            </span>
            {SORTS.map((option) =>
              option.key === sort ? (
                <span key={option.key} className="text-fg">
                  {option.label}
                </span>
              ) : (
                <Link
                  key={option.key}
                  href={
                    option.key === "presence"
                      ? "/projects"
                      : `/projects?sort=${option.key}`
                  }
                  prefetch={false}
                  className="text-subtle transition-colors hover:text-fg no-underline"
                >
                  {option.label}
                </Link>
              ),
            )}
          </span>
        }
      />
      <main className="shell pb-24">
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
              just aren't packages you can install. Authors can claim their page
              from it.
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
            {authorsAll.length > AUTHOR_CAP && (
              <p className="mt-3 text-small text-faint">
                Showing the {AUTHOR_CAP} most present of {authorsAll.length}{" "}
                authors; the rest are reachable from their kernels' pages.
              </p>
            )}
          </Section>
        )}

        <p className="mt-8 text-small text-faint">
          {sort === "presence"
            ? "Ordered by corpus presence, not merit."
            : "Records are counted inside their own cohorts."}{" "}
          <Link href="/docs#comparability">How comparison works →</Link>
        </p>
      </main>
    </>
  )
}
