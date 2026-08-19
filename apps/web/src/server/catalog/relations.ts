// Reviewed operation equivalence (§8.4). Two sources can publish the same
// computation as separate immutable specs (SOL-ExecBench renumbers the
// FlashInfer-Bench definitions it adopted); a reviewed `exactly_equivalent`
// relation lets one operation page present every definition's cohorts
// together without ever merging the cohorts themselves.
import { eq } from "drizzle-orm"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"

export const EXACTLY_EQUIVALENT = "exactly_equivalent"

type CandidateOperation = {
  slug: string
  manifest: { spec: Record<string, unknown> }
}

const stable = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value !== null && typeof value === "object")
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`
  return JSON.stringify(value)
}

/** The slug with a source numbering prefix ("025-") removed. */
const baseSlug = (slug: string) => slug.replace(/^\d+-/, "")

/**
 * Mechanical candidates for review: spec bodies identical after removing the
 * editorial family and reference fields, AND sharing a base slug. The name
 * requirement is load-bearing — signatures underdetermine semantics (prefix
 * sum and sort share one signature), so body equality alone must never
 * propose a relation.
 */
export function equivalenceCandidates<T extends CandidateOperation>(
  operations: T[],
): [T, T][] {
  const byBody = new Map<string, T[]>()
  for (const operation of operations) {
    const body = { ...operation.manifest.spec }
    delete body.family
    delete body.reference
    const key = stable(body)
    byBody.set(key, [...(byBody.get(key) ?? []), operation])
  }
  const pairs: [T, T][] = []
  for (const group of byBody.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (baseSlug(group[i].slug) !== baseSlug(group[j].slug)) continue
        const [a, b] = [group[i], group[j]].sort((x, y) =>
          x.slug.localeCompare(y.slug),
        )
        pairs.push([a, b])
      }
    }
  }
  return pairs
}

/**
 * Reviewed equivalence groups: operation id → every id in its group (self
 * included). In-process memo — relations change only through maintainer
 * review, and every operation read consults this map.
 */
const GROUPS_MEMO_MS = 300_000
let groupsMemo: { at: number; value: Promise<Map<string, string[]>> } | null =
  null
export function equivalenceGroups(): Promise<Map<string, string[]>> {
  if (groupsMemo && Date.now() - groupsMemo.at < GROUPS_MEMO_MS) {
    return groupsMemo.value
  }
  const value = readGroups()
  groupsMemo = { at: Date.now(), value }
  value.catch(() => {
    groupsMemo = null
  })
  return value
}

async function readGroups(): Promise<Map<string, string[]>> {
  const rows = await db()
    .select({
      from: schema.operationRelations.fromOperationId,
      to: schema.operationRelations.toOperationId,
    })
    .from(schema.operationRelations)
    .where(eq(schema.operationRelations.relation, EXACTLY_EQUIVALENT))
  // Pairs → connected groups (transitive: A~B and B~C put all three on one
  // page; each pair was still reviewed on its own).
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    const up = parent.get(id)
    if (up === undefined || up === id) return id
    const root = find(up)
    parent.set(id, root)
    return root
  }
  const seen = new Set<string>()
  for (const { from, to } of rows) {
    seen.add(from).add(to)
    parent.set(find(from), find(to))
  }
  const members = new Map<string, string[]>()
  for (const id of seen) {
    const root = find(id)
    members.set(root, [...(members.get(root) ?? []), id])
  }
  const groups = new Map<string, string[]>()
  for (const group of members.values()) {
    const sorted = [...group].sort()
    for (const id of sorted) groups.set(id, sorted)
  }
  return groups
}

/** The reviewed-equivalent operation ids for one operation, self included. */
export async function equivalentOperationIds(
  operationId: string,
): Promise<string[]> {
  return (await equivalenceGroups()).get(operationId) ?? [operationId]
}
