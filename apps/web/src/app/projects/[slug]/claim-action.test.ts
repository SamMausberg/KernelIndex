import { describe, expect, it } from "vitest"
import { claimEvidenceUrl } from "./claim-action.ts"

describe("claim evidence URL", () => {
  it("accepts public HTTPS evidence", () => {
    expect(
      claimEvidenceUrl.safeParse("https://github.com/example/project/issues/1")
        .success,
    ).toBe(true)
  })

  it.each([
    "http://github.com/example/project",
    "javascript:alert(1)",
    "https://user:secret@example.com/evidence",
  ])("rejects unsafe evidence URL %s", (url) => {
    expect(claimEvidenceUrl.safeParse(url).success).toBe(false)
  })
})
