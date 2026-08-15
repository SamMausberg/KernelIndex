"use client"

import { useRouter } from "next/navigation"
import { useId, useMemo, useState } from "react"
import type { OperationIndexEntry } from "@/lib/catalog-models"
import { parseQuery } from "@/lib/search-query"
import { matchSuggestions } from "@/lib/suggest"

// The corpus index loads once per session from the CDN-cached /suggest
// route instead of riding every page's payload (§16.5). Module-level so all
// inputs share one fetch; failures clear it for a later retry.
let indexPromise: Promise<OperationIndexEntry[]> | null = null
function loadIndex(): Promise<OperationIndexEntry[]> {
  indexPromise ??= fetch("/suggest")
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => {
      indexPromise = null
      return []
    })
  return indexPromise
}

/**
 * Progressive search input: a plain `q` field that, with JavaScript, suggests
 * operations from the corpus index as an ARIA combobox. Selecting navigates
 * to `op:<slug>` (keeping any facets already typed) — the exact resolution
 * tier — while plain Enter submits the surrounding form exactly as without
 * JavaScript. The parent form must be positioned (`relative`).
 */
export function SuggestInput({
  inputId,
  defaultValue = "",
  placeholder,
  className,
}: {
  inputId?: string
  defaultValue?: string
  placeholder?: string
  className?: string
}) {
  const router = useRouter()
  const listId = useId()
  const [index, setIndex] = useState<OperationIndexEntry[]>([])
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  // A navigation hands the input a new query without remounting it.
  const [lastDefault, setLastDefault] = useState(defaultValue)
  if (defaultValue !== lastDefault) {
    setLastDefault(defaultValue)
    setValue(defaultValue)
  }

  const matches = useMemo(() => {
    const intent = parseQuery(value)
    // An op:<slug> facet is already a resolved selection.
    if (intent.facets.some((facet) => facet.field === "op")) return []
    return matchSuggestions(intent.text, index)
  }, [value, index])
  const visible = open && matches.length > 0

  const select = (entry: OperationIndexEntry) => {
    const facets = parseQuery(value)
      .facets.filter((facet) => facet.field !== "op")
      .map((facet) => facet.token)
    const query = [...facets, `op:${entry.slug}`].join(" ")
    setOpen(false)
    setValue(query)
    router.push(`/search?q=${encodeURIComponent(query)}`)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (matches.length === 0) return
      event.preventDefault()
      setOpen(true)
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive(
        ((active + step + matches.length + 1) % (matches.length + 1)) - 1,
      )
      return
    }
    if (event.key === "Enter") {
      if (visible && active >= 0) {
        event.preventDefault()
        select(matches[active])
      } else setOpen(false)
      return
    }
    if (event.key === "Escape" && visible) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <>
      <input
        id={inputId}
        name="q"
        value={value}
        onFocus={() => {
          loadIndex().then(setIndex)
        }}
        onChange={(event) => {
          setValue(event.target.value)
          setOpen(true)
          setActive(-1)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        className={className}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={
          visible && active >= 0 ? `${listId}-${active}` : undefined
        }
      />
      {visible && (
        <div
          id={listId}
          role="listbox"
          data-suggest-popup
          className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[6px] border border-edge bg-raised py-1"
        >
          {matches.map((entry, position) => (
            <div
              key={entry.slug}
              id={`${listId}-${position}`}
              role="option"
              tabIndex={-1}
              aria-selected={position === active}
              onMouseDown={(event) => {
                event.preventDefault()
                select(entry)
              }}
              onMouseEnter={() => setActive(position)}
              className={`flex cursor-pointer items-baseline gap-3.5 px-3.5 py-[8px] ${
                position === active ? "bg-accent-soft" : ""
              }`}
            >
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-fg">
                {entry.name}
              </span>
              <span className="text-[11.5px] text-faint max-sm:hidden">
                {entry.family}
              </span>
              <span className="min-w-[56px] text-right font-mono text-[11.5px] text-subtle">
                {entry.runs > 0 ? `${entry.runs} runs` : "no runs"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
