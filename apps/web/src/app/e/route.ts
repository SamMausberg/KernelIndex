// §20.5 client beacon endpoint — for the few events the server cannot see
// at render time because run dossiers are ISR/CDN-cached. Accepts a tiny
// JSON body from sendBeacon, validates against the allowlist, stores no
// identity, and always answers 204 regardless of outcome.
import { BEACON_EVENTS, recordEvent } from "@/server/events"

const KINDS = ["run", "serving_run"] as const

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.text()
    if (body.length <= 256) {
      const { event, kind } = JSON.parse(body) as {
        event?: unknown
        kind?: unknown
      }
      const allowed = BEACON_EVENTS.find((name) => name === event)
      const target = KINDS.find((name) => name === kind)
      if (allowed) await recordEvent(allowed, target ? { kind: target } : {})
    }
  } catch {
    // Malformed beacons are dropped silently; there is nothing to tell.
  }
  return new Response(null, { status: 204 })
}
