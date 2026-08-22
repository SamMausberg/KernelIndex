// The reader's narrowed feed (§13.11): session-authorized, never cached.
// Reading it is seeing it — the watermark advances after the previous one
// is captured, so the island can mark what is new.

import { getFeed } from "@/lib/catalog"
import { followingFeed } from "@/server/follows"
import { sessionUser } from "@/server/policy/authorization"

export const dynamic = "force-dynamic"

export async function GET(request: Request): Promise<Response> {
  const user = await sessionUser(request.headers)
  if (user === null)
    return new Response(null, {
      status: 401,
      headers: { "Cache-Control": "private, no-store" },
    })
  return Response.json(await followingFeed(user.id, await getFeed()), {
    headers: { "Cache-Control": "private, no-store" },
  })
}
