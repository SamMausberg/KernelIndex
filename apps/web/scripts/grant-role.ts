// Maintainer command (§15.8): grant or revoke a KernelIndex role by email.
//   pnpm --filter @kernelindex/web exec node scripts/grant-role.ts <email> site_admin [--revoke]
import { parseArgs } from "node:util"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/server/db/schema.ts"

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { revoke: { type: "boolean", default: false } },
})
const [email, role] = positionals
if (!email || !role) {
  console.error("usage: grant-role <email> <role> [--revoke]")
  process.exit(2)
}
const url = process.env.DATABASE_URL
if (!url) {
  console.error("Set DATABASE_URL.")
  process.exit(1)
}
const client = postgres(url, { max: 1 })
const database = drizzle(client, { schema })
try {
  const [user] = await database
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.email, email))
  if (!user) {
    console.error(`no user with email ${email} — sign in once first`)
    process.exit(1)
  }
  if (values.revoke) {
    await database
      .delete(schema.userRoles)
      .where(
        and(
          eq(schema.userRoles.userId, user.id),
          eq(schema.userRoles.role, role),
        ),
      )
    console.log(`revoked ${role} from ${user.name}`)
  } else {
    await database
      .insert(schema.userRoles)
      .values({ userId: user.id, role })
      .onConflictDoNothing()
    console.log(`granted ${role} to ${user.name}`)
  }
  await database.insert(schema.auditEvents).values({
    actor: "maintainer:cli",
    action: values.revoke ? "revoke_role" : "grant_role",
    targetKind: "user",
    targetId: user.id,
    reason: role,
  })
} finally {
  await client.end()
}
