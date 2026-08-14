"use client"

import { useRouter } from "next/navigation"
import { useEffect } from "react"

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
