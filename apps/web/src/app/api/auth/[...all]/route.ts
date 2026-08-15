// Better Auth handler mount (§13.6). Session and OAuth endpoints only;
// KernelIndex authorization decisions live in server/policy/authorization.
import { auth } from "@/server/auth"

const handler = (request: Request) => auth().handler(request)

export const GET = handler
export const POST = handler
