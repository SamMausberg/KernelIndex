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
import { formatInstantUTC } from "@/lib/format"

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Standing per GPU software project: kernels indexed, benchmark runs, records held inside their own cohorts, and 30-day record movement.",
  alternates: { canonical: "/projects" },
}

// Standings columns (§16 row diet): who, the standing with its share bar,
// its 30-day movement, then the evidence volume. Freshness, trust ceiling,
// licensing, and hardware belong to the project dossier, not this scan.
const GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_minmax(120px,0.9fr)_82px_110px_72px_72px] gap-x-5 min-w-[760px]"

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

function ProjectRow({
  project,
  maxRecords,
}: {
  project: ProjectIndexEntry
  maxRecords: number
}) {
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
      {/* Length carries the standing's share (§16.2); the printed count
          stays the record of fact. */}
      <div aria-hidden="true" className="flex items-center">
        <span
          className="block h-[9px]"
          style={{
            width: `${Math.max((project.records / (maxRecords || 1)) * 100, project.records > 0 ? 1 : 0)}%`,
            background: "var(--color-viz-1)",
          }}
        />
      </div>
      <div className="text-right font-mono text-small text-fg">
        {project.records.toLocaleString("en-US")}
      </div>
      {/* One movement cell: losses are facts the minus sign already states
          (§16.16), so only the gain carries color and zero halves stay out. */}
      <div className="text-right font-mono text-small whitespace-nowrap">
        {project.gained30d === 0 && project.lost30d === 0 ? (
          <span className="text-faint">—</span>
        ) : (
          <>
            {project.gained30d > 0 && (
              <span className="text-success">+{project.gained30d}</span>
            )}
            {project.gained30d > 0 && project.lost30d > 0 && " "}
            {project.lost30d > 0 && (
              <span className="text-subtle">−{project.lost30d}</span>
            )}
          </>
        )}
      </div>
      <div className="text-right font-mono text-small text-subtle">
        {project.implementations.toLocaleString("en-US")}
      </div>
      <div className="text-right font-mono text-small text-subtle">
        {project.runs.toLocaleString("en-US")}
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
      <div />
      <div className="text-right">Records</div>
      <div className="text-right">±30d</div>
      <div className="text-right">Kernels</div>
      <div className="text-right">Runs</div>
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
      {/* No subtitle (2026-08-25): the cohort-counting rule is stated once,
          in the page footer. */}
      <ContextHeader title="Projects" />
      <main className="shell pb-24">
        <Section id="libraries" title="Libraries">
          {/* The sort rides with the tables it orders, not the page header
              (§16 header diet); both groups share it. */}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="max-w-[76ch] text-body text-muted">
              Software you can adopt: real projects with a repository, a license
              conclusion, and benchmark evidence behind each row.
            </p>
            <span className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-small">
              <span className="text-faint">sorted by</span>
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
          </div>
          <div className="overflow-x-auto">
            <TableHead />
            {libraries.map((project) => (
              <ProjectRow
                key={project.slug}
                project={project}
                maxRecords={Math.max(...libraries.map((p) => p.records), 0)}
              />
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
                  <ProjectRow
                    key={project.slug}
                    project={project}
                    maxRecords={Math.max(...authors.map((p) => p.records), 0)}
                  />
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

        {/* Same ledger as every project dossier, cached on its own ISR
            clock: the stated snapshot is what makes a few minutes' drift
            between the two record counts a fact, not a discrepancy. */}
        <p className="mt-8 text-small text-faint">
          {sort === "presence"
            ? "Ordered by corpus presence, not merit."
            : "Records are counted inside their own cohorts."}{" "}
          Records as of {formatInstantUTC(model.recordsAsOf)}.{" "}
          <Link href="/docs#comparability">How comparison works →</Link>
        </p>
      </main>
    </>
  )
}
