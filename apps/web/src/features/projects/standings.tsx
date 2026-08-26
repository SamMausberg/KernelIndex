"use client"

import { type ReactNode, useEffect, useState } from "react"
import { ExpandRows } from "@/components/expand-rows"
import { Link } from "@/components/quiet-link"
import { Section } from "@/components/section"
import type { ProjectIndexEntry } from "@/lib/catalog"
import { AUTHOR_CAP, SORTS, type Sort, sorted } from "./sort"

// The projects standings island (§16.12 records pattern): the page is ISR
// and renders the presence order; the island reads `?sort=` after
// hydration and re-sorts client-side, keeping the URL shareable. The rows
// are already on the page, so no sort ever costs a server render.
// Standings columns (§16 row diet): who, the standing with its share bar,
// its 30-day movement, then the evidence volume. Freshness, trust ceiling,
// licensing, and hardware belong to the project dossier, not this scan.
const GRID =
  "grid grid-cols-[minmax(230px,1.5fr)_minmax(120px,0.9fr)_82px_110px_72px_72px] gap-x-5 min-w-[760px]"

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

/** Which cap note the footer prints depends on the total; the page owns it. */
export function ProjectStandings({
  libraries,
  authors,
  authorsTotal,
  footer,
}: {
  libraries: ProjectIndexEntry[]
  authors: ProjectIndexEntry[]
  authorsTotal: number
  /** The page's snapshot line, joined to the ordering note it depends on. */
  footer: ReactNode
}) {
  const [sort, setSort] = useState<Sort>("presence")
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("sort")
    const initial = SORTS.find((option) => option.key === requested)?.key
    if (initial) setSort(initial)
  }, [])
  const select = (event: React.MouseEvent, next: Sort) => {
    event.preventDefault()
    setSort(next)
    window.history.replaceState(
      null,
      "",
      next === "presence" ? "/projects" : `/projects?sort=${next}`,
    )
  }
  const sortedLibraries = sorted(libraries, sort)
  const sortedAuthors = sorted(authors, sort).slice(0, AUTHOR_CAP)
  return (
    <>
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
                <a
                  key={option.key}
                  href={
                    option.key === "presence"
                      ? "/projects"
                      : `/projects?sort=${option.key}`
                  }
                  onClick={(event) => select(event, option.key)}
                  className="text-subtle transition-colors hover:text-fg no-underline"
                >
                  {option.label}
                </a>
              ),
            )}
          </span>
        </div>
        <div className="overflow-x-auto">
          <TableHead />
          {sortedLibraries.map((project) => (
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
              rows={sortedAuthors.map((project) => (
                <ProjectRow
                  key={project.slug}
                  project={project}
                  maxRecords={Math.max(...authors.map((p) => p.records), 0)}
                />
              ))}
            />
          </div>
          {authorsTotal > AUTHOR_CAP && (
            <p className="mt-3 text-small text-faint">
              Showing the {AUTHOR_CAP} most present of {authorsTotal} authors;
              the rest are reachable from their kernels' pages.
            </p>
          )}
        </Section>
      )}
      <p className="mt-8 text-small text-faint">
        {sort === "presence"
          ? "Ordered by corpus presence, not merit."
          : "Records are counted inside their own cohorts."}{" "}
        {footer}
      </p>
    </>
  )
}
