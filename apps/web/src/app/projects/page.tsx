// Projects index (§16.4): every software project's standing — records
// held, gained and lost, evidence ceiling, licensing, availability — so
// "should I adopt X or Y" and "who is winning" start from facts. Libraries
// lead; competition authors are their own group (projects.kind), never
// interleaved with adoptable software. Sorted by records held this is the
// standings surface (§16.12): records are counted inside their own cohorts
// and cohorts are never ranked against each other. ISR: the sort is the
// URL, applied by the standings island after hydration (2026-08-26; the
// page used to render per request for it).
import type { Metadata } from "next"
import { ContextHeader } from "@/components/context-header"
import { IllustrativeNotice } from "@/components/illustrative-notice"
import { Link } from "@/components/quiet-link"
import { AUTHOR_CAP, SORTS, sorted } from "@/features/projects/sort"
import { ProjectStandings } from "@/features/projects/standings"
import { getProjectIndex } from "@/lib/catalog"
import { formatInstantUTC } from "@/lib/format"

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Standing per GPU software project: kernels indexed, benchmark runs, records held inside their own cohorts, and 30-day record movement.",
  alternates: { canonical: "/projects" },
}
export const revalidate = 3600

export default async function ProjectsPage() {
  const model = await getProjectIndex()
  const libraries = model.projects.filter((p) => p.kind === "library")
  const authorsAll = model.projects.filter((p) => p.kind === "individual")
  // SSR row cap (§16 payload budget): the tail of the authors group is
  // hundreds of one-submission contest identities. The island sorts
  // client-side, so ship the union of every sort's top slice — each order
  // then shows exactly the rows the server would have.
  const shipped = new Set(
    SORTS.flatMap((option) =>
      sorted(authorsAll, option.key)
        .slice(0, AUTHOR_CAP)
        .map((p) => p.slug),
    ),
  )
  const authors = authorsAll.filter((p) => shipped.has(p.slug))
  return (
    <>
      {model.illustrative && <IllustrativeNotice />}
      {/* No subtitle (2026-08-25): the cohort-counting rule is stated once,
          in the page footer. */}
      <ContextHeader title="Projects" />
      <main className="shell pb-24">
        <ProjectStandings
          libraries={libraries}
          authors={authors}
          authorsTotal={authorsAll.length}
          // Same ledger as every project dossier, cached on its own ISR
          // clock: the stated snapshot is what makes a few minutes' drift
          // between the two record counts a fact, not a discrepancy.
          footer={
            <>
              Records as of {formatInstantUTC(model.recordsAsOf)}.{" "}
              <Link href="/docs#comparability">How comparison works →</Link>
            </>
          }
        />
      </main>
    </>
  )
}
