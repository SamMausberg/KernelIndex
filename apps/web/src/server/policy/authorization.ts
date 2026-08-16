// Centralized authorization (§13.6, §15.8): every sensitive action names a
// policy function here; no scattered isAdmin checks. Roles are KernelIndex
// rows in user_roles, granted by a maintainer command, never by OAuth.
import { eq } from "drizzle-orm"
import { auth, authConfigured } from "../auth.ts"
import { db } from "../db/client.ts"
import * as schema from "../db/schema.ts"

export type SessionUser = {
  id: string
  name: string
  email: string
  roles: string[]
}

/** Session user with roles, or null when signed out / auth unconfigured. */
export async function sessionUser(
  headers: Headers,
): Promise<SessionUser | null> {
  if (!authConfigured) return null
  const session = await auth().api.getSession({ headers })
  if (!session) return null
  const roles = await db()
    .select({ role: schema.userRoles.role })
    .from(schema.userRoles)
    .where(eq(schema.userRoles.userId, session.user.id))
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    roles: roles.map((row) => row.role),
  }
}

/** The founder role: everything site_admin can do, plus role governance.
 * Granted once by `scripts/grant-role.ts <email> owner` against the
 * production database — never through the web or OAuth. */
export const isOwner = (user: SessionUser | null): boolean =>
  user !== null && user.roles.includes("owner")

export const isSiteAdmin = (user: SessionUser | null): boolean =>
  isOwner(user) || (user !== null && user.roles.includes("site_admin"))

/** §10.7 corrections: retraction and supersession are maintainer actions. */
export const canCorrectRuns = isSiteAdmin

/** §15.4 review: accepting or rejecting submissions and claims. */
export const canReviewSubmissions = isSiteAdmin

/** §15.5: any signed-in contributor may draft and submit evidence. */
export const canSubmit = (user: SessionUser | null): boolean => user !== null
