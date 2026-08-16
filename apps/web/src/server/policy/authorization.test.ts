// Authorization truth table (§21.1): the pure predicates behind every
// mutating surface, exercised for null, roleless, and site_admin actors.
import { describe, expect, it } from "vitest"
import {
  canCorrectRuns,
  canReviewSubmissions,
  canSubmit,
  isSiteAdmin,
  type SessionUser,
} from "./authorization.ts"

const user = (roles: string[]): SessionUser => ({
  id: "u1",
  name: "user",
  email: "u1@test.invalid",
  roles,
})

describe("authorization policy", () => {
  const cases: [string, SessionUser | null][] = [
    ["signed out", null],
    ["roleless", user([])],
    ["unrelated role", user(["contributor"])],
    ["site_admin", user(["site_admin"])],
  ]

  it("deny-by-default: only site_admin passes admin predicates", () => {
    for (const [label, actor] of cases) {
      const admin = label === "site_admin"
      expect(isSiteAdmin(actor), label).toBe(admin)
      expect(canCorrectRuns(actor), label).toBe(admin)
      expect(canReviewSubmissions(actor), label).toBe(admin)
    }
  })

  it("submitting requires a session, never a role", () => {
    expect(canSubmit(null)).toBe(false)
    expect(canSubmit(user([]))).toBe(true)
  })
})
