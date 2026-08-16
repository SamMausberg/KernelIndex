// Browser-side Better Auth client (§13.6). Sign-in/sign-out are POST
// endpoints, so plain anchor tags cannot drive them; the tiny generated
// client owns the POST + redirect dance. Server code never imports this.
import { createAuthClient } from "better-auth/react"

export const authClient = createAuthClient()
