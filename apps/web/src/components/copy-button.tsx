"use client"

import { useRef, useState } from "react"

/** Copies `text` and confirms inline for 1.4 s (§16.2: functional motion). */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {})
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), 1400)
      }}
      className="key flex-none cursor-pointer px-2 py-[3px] text-[12px] text-muted hover:text-fg"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  )
}
