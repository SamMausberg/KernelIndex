"use client"

import { useEffect } from "react"

/** Best-effort §20.5 product beacon: no cookies, no identity, never blocks
 * navigation. A no-op when the browser lacks sendBeacon. */
export function beacon(event: string, kind?: "run" | "serving_run") {
  navigator.sendBeacon?.("/e", JSON.stringify({ event, kind }))
}

/** Counts one evidence_opened per dossier mount — the server cannot see
 * these views because the pages are ISR/CDN-cached. */
export function EvidenceOpened({ kind }: { kind: "run" | "serving_run" }) {
  useEffect(() => beacon("evidence_opened", kind), [kind])
  return null
}
