"use client"

import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * The shortcut hint, matching the keyboard the visitor actually has. The
 * handler below has always accepted both modifiers, but the header advertised
 * ⌘K to everyone, so Windows and Linux visitors were told the wrong key.
 *
 * The server cannot know the platform, so ⌘K is the first paint (this
 * audience skews Mac) and a non-Mac corrects itself once on mount.
 */
export function useShortcutHint(): string {
  const [hint, setHint] = useState("⌘K")
  useEffect(() => {
    if (!/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) setHint("Ctrl K")
  }, [])
  return hint
}

/** Global ⌘K / Ctrl+K: focus the header search when present, else open /search. */
export function CommandK() {
  const router = useRouter()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "k" || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      const input = document.getElementById("header-search-input")
      if (input instanceof HTMLInputElement) input.focus()
      else router.push("/search")
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [router])
  return null
}
