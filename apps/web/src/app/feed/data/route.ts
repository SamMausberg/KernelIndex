// The reader's narrowed feed (§13.11): session-authorized, never cached.
// GET is pure; the island explicitly advances the watermark with POST only
// after it has successfully received the feed.

import { getFeed } from "@/lib/catalog"
import { followingFeed, markSeen } from "@/server/follows"
import { sessionUser } from "@/server/policy/authorization"

export const dynamic = "force-dynamic"

const privateHeaders = { "Cache-Control": "private, no-store" }

export async function GET(request: Request): Promise<Response> {
  const user = await sessionUser(request.headers)
  if (user === null)
    return new Response(null, {
      status: 401,
      headers: privateHeaders,
    })
  // Capture before the catalog read: a concurrent event may be shown twice,
  // but is never acknowledged without having appeared in this snapshot.
  const seenThrough = new Date()
  return Response.json(
    await followingFeed(user.id, await getFeed(), seenThrough),
    {
      headers: privateHeaders,
    },
  )
}

export async function POST(request: Request): Promise<Response> {
  if (request.headers.get("Origin") !== new URL(request.url).origin)
    return new Response(null, { status: 403, headers: privateHeaders })
  const user = await sessionUser(request.headers)
  if (user === null)
    return new Response(null, { status: 401, headers: privateHeaders })
  const value = new URL(request.url).searchParams.get("seenThrough") ?? ""
  const seenThrough = new Date(value)
  if (
    Number.isNaN(seenThrough.getTime()) ||
    seenThrough.toISOString() !== value ||
    seenThrough.getTime() > Date.now()
  )
    return new Response(null, { status: 400, headers: privateHeaders })
  await markSeen(user.id, seenThrough)
  return new Response(null, { status: 204, headers: privateHeaders })
}
