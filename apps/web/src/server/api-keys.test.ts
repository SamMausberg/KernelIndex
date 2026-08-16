// API keys (§13.6–13.7): hash-only storage, lifecycle rejection, quota
// counting, and the /api/v1 middleware contract. Uses a throwaway user;
// cascade delete cleans every row the suite created.
import { eq } from "drizzle-orm"
import { afterAll, describe, expect, it } from "vitest"
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  verifyApiKey,
} from "./api-keys.ts"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

const url = process.env.DATABASE_URL
const USER = `api-key-test-${process.pid}`

describe.skipIf(!url)("api keys (database)", () => {
  afterAll(async () => {
    await db().delete(schema.users).where(eq(schema.users.id, USER))
  })

  async function user() {
    await db()
      .insert(schema.users)
      .values({ id: USER, name: "key tester", email: `${USER}@test.invalid` })
      .onConflictDoNothing()
  }

  it("stores only a hash and verifies the live token", async () => {
    await user()
    const { token, id, prefix } = await createApiKey(USER, "laptop")
    expect(token.startsWith("ki_")).toBe(true)
    expect(prefix).toBe(token.slice(0, 9))
    const [row] = await db()
      .select()
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.id, id))
    expect(row.secretHash).not.toContain(token.slice(3))
    expect(row.scopes).toEqual(["catalog:read"])

    const verified = await verifyApiKey(token)
    expect(verified).toEqual({
      ok: true,
      identity: { keyId: id, userId: USER, scopes: ["catalog:read"] },
    })
    const [listed] = await listApiKeys(USER)
    expect(listed.usedToday).toBe(1)
    expect(listed.lastUsedAt).not.toBeNull()
  })

  it("rejects unknown, revoked, and expired keys", async () => {
    await user()
    expect(await verifyApiKey("ki_not-a-real-token")).toEqual({
      ok: false,
      reason: "unknown",
    })
    const { token, id } = await createApiKey(USER, "revoked-key")
    expect(await revokeApiKey(USER, id)).toBe(true)
    expect(await verifyApiKey(token)).toEqual({ ok: false, reason: "revoked" })
    // Revoking someone else's key never succeeds (IDOR guard).
    const other = await createApiKey(USER, "other")
    expect(await revokeApiKey("someone-else", other.id)).toBe(false)

    const expired = await createApiKey(USER, "expired-key")
    await db()
      .update(schema.apiKeys)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.apiKeys.id, expired.id))
    expect(await verifyApiKey(expired.token)).toEqual({
      ok: false,
      reason: "expired",
    })
  })

  it("returns quota exhaustion once the daily counter passes the limit", async () => {
    await user()
    const { token, id } = await createApiKey(USER, "tiny-quota")
    await db()
      .update(schema.apiKeys)
      .set({ quotaPerDay: 2 })
      .where(eq(schema.apiKeys.id, id))
    expect((await verifyApiKey(token)).ok).toBe(true)
    expect((await verifyApiKey(token)).ok).toBe(true)
    expect(await verifyApiKey(token)).toEqual({ ok: false, reason: "quota" })
  })

  it("middleware: 401 problem for a dead ki_ token; other bearers pass", async () => {
    const { api } = await import("./api/app.ts")
    const dead = await api.request("/search?q=rmsnorm", {
      headers: { Authorization: "Bearer ki_definitely-not-valid" },
    })
    expect(dead.status).toBe(401)
    expect(dead.headers.get("content-type")).toContain(
      "application/problem+json",
    )
    expect((await dead.json()).code).toBe("INVALID_API_KEY")

    const other = await api.request("/search?q=rmsnorm", {
      headers: { Authorization: "Bearer not-a-kernelindex-key" },
    })
    expect(other.status).toBe(200)

    const me = await api.request("/me")
    expect(me.status).toBe(401)
    expect((await me.json()).code).toBe("API_KEY_REQUIRED")
  })

  it("middleware: 429 with Retry-After when the quota is exhausted", async () => {
    await user()
    const { api } = await import("./api/app.ts")
    const { token, id } = await createApiKey(USER, "middleware-quota")
    await db()
      .update(schema.apiKeys)
      .set({ quotaPerDay: 0 })
      .where(eq(schema.apiKeys.id, id))
    const response = await api.request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(response.status).toBe(429)
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await response.json()).code).toBe("QUOTA_EXCEEDED")
  })
})
