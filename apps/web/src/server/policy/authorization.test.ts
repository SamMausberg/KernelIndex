// Authorization truth table (§21.1): the pure predicates behind every
// mutating surface, exercised for null, roleless, and site_admin actors.
import { describe, expect, it } from "vitest"
import {
  canAutoApproveClaim,
  canCorrectRuns,
  canReviewSubmissions,
  canSubmit,
  isOwner,
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
    ["owner", user(["owner"])],
  ]

  it("deny-by-default: only site_admin and owner pass admin predicates", () => {
    for (const [label, actor] of cases) {
      const admin = label === "site_admin" || label === "owner"
      expect(isSiteAdmin(actor), label).toBe(admin)
      expect(canCorrectRuns(actor), label).toBe(admin)
      expect(canReviewSubmissions(actor), label).toBe(admin)
      expect(isOwner(actor), label).toBe(label === "owner")
    }
  })

  it("submitting requires a session, never a role", () => {
    expect(canSubmit(null)).toBe(false)
    expect(canSubmit(user([]))).toBe(true)
  })

  it("auto-approves a claim only for the GitHub login owning the path", () => {
    const github = { kind: "github", id: "Sam/kernels" }
    expect(canAutoApproveClaim("sam", github)).toBe(true)
    expect(canAutoApproveClaim("someone", github)).toBe(false)
    // Organization repositories and other hosts never auto-approve.
    expect(
      canAutoApproveClaim("linkedin", { kind: "other", id: "linkedin" }),
    ).toBe(false)
    expect(canAutoApproveClaim("sam", { kind: "github", id: "/repo" })).toBe(
      false,
    )
    expect(canAutoApproveClaim("sam", null)).toBe(false)
  })
})
