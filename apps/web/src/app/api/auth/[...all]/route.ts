// Better Auth handler mount (§13.6). Session and OAuth endpoints only;
// KernelIndex authorization decisions live in server/policy/authorization.
import { auth, authConfigured } from "@/server/auth"

const handler = (request: Request) =>
  authConfigured
    ? auth().handler(request)
    : new Response("Not found", { status: 404 })

export const GET = handler
export const POST = handler
