"use client"

import { useRef, useState } from "react"
import { beacon } from "./beacon"

/** Copies `text` and confirms inline for 1.4 s (§16.2: functional motion).
 * `event` optionally counts the copy as a §20.5 product event. */
export function CopyButton({ text, event }: { text: string; event?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {})
        if (event) beacon(event)
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1400)
      }}
      className="key flex-none cursor-pointer px-2 py-1 text-small text-muted hover:text-fg"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  )
}
