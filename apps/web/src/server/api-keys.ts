// Scoped API keys (§13.6–13.7): ki_-prefixed high-entropy tokens, SHA-256
// hash-only storage, explicit scopes, and per-day quotas tracked in
// PostgreSQL. Creation returns the secret exactly once; verification is one
// round trip that also counts usage and stamps last use.
import { createHash, randomBytes } from "node:crypto"
import { and, eq, isNull, sql } from "drizzle-orm"
import { db } from "./db/client.ts"
import * as schema from "./db/schema.ts"

export const API_KEY_SCOPES = [
  "catalog:read",
  "submissions:read",
  "submissions:write",
  "projects:claim",
  "projects:write",
  "artifacts:read",
] as const
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number]

export const TOKEN_PREFIX = "ki_"
const hashToken = (token: string) =>
  createHash("sha256").update(token).digest("hex")

export type ApiKeyIdentity = {
  keyId: string
  userId: string
  scopes: string[]
}

export type VerifyResult =
  | { ok: true; identity: ApiKeyIdentity }
  | { ok: false; reason: "unknown" | "revoked" | "expired" | "quota" }

/** Mint a key for a user; the token is returned once and never stored. */
export async function createApiKey(
  userId: string,
  name: string,
  scopes: ApiKeyScope[] = ["catalog:read"],
): Promise<{ token: string; id: string; prefix: string }> {
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`
  const prefix = token.slice(0, 9)
  const [row] = await db()
    .insert(schema.apiKeys)
    .values({ userId, name, prefix, secretHash: hashToken(token), scopes })
    .returning({ id: schema.apiKeys.id })
  await audit(userId, "api_key.create", row.id, name)
  return { token, id: row.id, prefix }
}

/** Revocation is immediate and permanent; the row stays for the audit. */
export async function revokeApiKey(
  userId: string,
  keyId: string,
): Promise<boolean> {
  const revoked = await db()
    .update(schema.apiKeys)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.apiKeys.id, keyId),
        eq(schema.apiKeys.userId, userId),
        isNull(schema.apiKeys.revokedAt),
      ),
    )
    .returning({ id: schema.apiKeys.id })
  if (revoked.length === 0) return false
  await audit(userId, "api_key.revoke", keyId, null)
  return true
}

/**
 * One CTE round trip: find the live key by hash, bump today's usage counter,
 * stamp last use, and report whether the quota still holds. Counting happens
 * only for authenticated calls — anonymous reads ride the CDN untouched.
 */
export async function verifyApiKey(token: string): Promise<VerifyResult> {
  const rows = (await db().execute(sql`
    with key as (
      select id, user_id, scopes, quota_per_day, expires_at, revoked_at
      from api_keys where secret_hash = ${hashToken(token)}
    ), usage as (
      insert into api_key_usage (api_key_id, day, count)
      select id, current_date, 1 from key
        where revoked_at is null and (expires_at is null or expires_at > now())
      on conflict (api_key_id, day) do update set count = api_key_usage.count + 1
      returning count
    ), stamp as (
      update api_keys set last_used_at = now()
        where id in (select id from key) returning id
    )
    select key.id, key.user_id, key.scopes, key.quota_per_day,
      key.revoked_at is not null as revoked,
      key.expires_at is not null and key.expires_at <= now() as expired,
      (select count from usage) as used_today
    from key`)) as {
    id: string
    user_id: string
    scopes: string[]
    quota_per_day: number
    revoked: boolean
    expired: boolean
    used_today: number | null
  }[]
  const row = rows[0]
  if (!row) return { ok: false, reason: "unknown" }
  if (row.revoked) return { ok: false, reason: "revoked" }
  if (row.expired) return { ok: false, reason: "expired" }
  if (row.used_today !== null && Number(row.used_today) > row.quota_per_day)
    return { ok: false, reason: "quota" }
  return {
    ok: true,
    identity: { keyId: row.id, userId: row.user_id, scopes: row.scopes },
  }
}

export async function listApiKeys(userId: string) {
  const keys = await db()
    .select({
      id: schema.apiKeys.id,
      name: schema.apiKeys.name,
      prefix: schema.apiKeys.prefix,
      scopes: schema.apiKeys.scopes,
      quotaPerDay: schema.apiKeys.quotaPerDay,
      revokedAt: schema.apiKeys.revokedAt,
      lastUsedAt: schema.apiKeys.lastUsedAt,
      createdAt: schema.apiKeys.createdAt,
      usedToday: sql<number>`coalesce((
        select u.count from api_key_usage u
        where u.api_key_id = ${schema.apiKeys.id} and u.day = current_date), 0)::int`,
    })
    .from(schema.apiKeys)
    .where(eq(schema.apiKeys.userId, userId))
    .orderBy(schema.apiKeys.createdAt)
  return keys
}

function audit(
  actor: string,
  action: string,
  targetId: string,
  reason: string | null,
) {
  return db().insert(schema.auditEvents).values({
    actor,
    action,
    targetKind: "api_key",
    targetId,
    reason,
  })
}
