// Sort vocabulary of the projects standings (§16.12), shared by the ISR
// page (which ships the union of every sort's top slice) and the client
// island (which orders it).
import type { ProjectIndexEntry } from "@/lib/catalog"

// SSR row cap (§16 payload budget): the tail of the authors group is
// hundreds of one-submission contest identities; every project past the cap
// stays reachable from its implementations' pages, and the cut is stated.
export const AUTHOR_CAP = 100

export const SORTS = [
  { key: "presence", label: "Presence" },
  { key: "records", label: "Records held" },
  { key: "gained", label: "Gained 30d" },
] as const
export type Sort = (typeof SORTS)[number]["key"]

export function sorted(projects: ProjectIndexEntry[], sort: Sort) {
  const copy = [...projects]
  if (sort === "records")
    copy.sort((a, b) => b.records - a.records || b.runs - a.runs)
  if (sort === "gained")
    copy.sort((a, b) => b.gained30d - a.gained30d || b.records - a.records)
  return copy
}
