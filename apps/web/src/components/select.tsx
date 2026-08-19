"use client"

import { useId, useRef, useState } from "react"

export type SelectOption = {
  value: string
  label: string
  /** Right-aligned faint detail, e.g. a run count. */
  detail?: string
}

/**
 * Site-native replacement for a form `<select>`: a recessed well that opens
 * the same raised listbox as the search suggest popup, instead of the OS
 * default menu. A hidden input carries the value, so the surrounding plain
 * GET form (and its shareable URL) is untouched. Full listbox keyboard
 * semantics: arrows, Home/End, Enter, Escape.
 */
export function Select({
  name,
  ariaLabel,
  options,
  defaultValue = "",
  className,
}: {
  name: string
  /** Accessible name for the combobox; the visible caption sits outside. */
  ariaLabel: string
  options: SelectOption[]
  defaultValue?: string
  className?: string
}) {
  const listId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const [value, setValue] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)

  const selectedAt = options.findIndex((option) => option.value === value)
  const selected = selectedAt >= 0 ? options[selectedAt] : undefined

  const openAtSelection = () => {
    setActive(Math.max(selectedAt, 0))
    setOpen(true)
  }
  const choose = (option: SelectOption) => {
    setValue(option.value)
    setOpen(false)
    buttonRef.current?.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      if (!open) return openAtSelection()
      const step = event.key === "ArrowDown" ? 1 : -1
      setActive((active + step + options.length) % options.length)
      return
    }
    if (event.key === "Home" && open) {
      event.preventDefault()
      setActive(0)
      return
    }
    if (event.key === "End" && open) {
      event.preventDefault()
      setActive(options.length - 1)
      return
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      if (open && active >= 0) choose(options[active])
      else openAtSelection()
      return
    }
    if (event.key === "Escape" && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <input type="hidden" name={name} value={value} />
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 ? `${listId}-${active}` : undefined
        }
        onClick={() => (open ? setOpen(false) : openAtSelection())}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        className="well flex h-8 w-full cursor-pointer items-center gap-2 px-2 text-left font-mono text-small"
      >
        <span className="min-w-0 flex-1 truncate">
          {selected ? selected.label : "any"}
        </span>
        <span aria-hidden="true" className="text-label text-faint">
          ▾
        </span>
      </button>
      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-[320px] min-w-max overflow-y-auto rounded-md border border-edge bg-raised py-1"
        >
          {options.map((option, position) => (
            <div
              key={option.value}
              id={`${listId}-${position}`}
              role="option"
              tabIndex={-1}
              aria-selected={option.value === value}
              onMouseDown={(event) => {
                event.preventDefault()
                choose(option)
              }}
              onMouseEnter={() => setActive(position)}
              className={`flex cursor-pointer items-baseline gap-3.5 px-3 py-1.5 ${
                position === active ? "bg-accent-soft" : ""
              }`}
            >
              <span
                className={`min-w-0 flex-1 truncate text-small ${
                  option.value === value ? "text-accent" : "text-fg"
                }`}
              >
                {option.label}
              </span>
              {option.detail && (
                <span className="shrink-0 font-mono text-mini text-faint">
                  {option.detail}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
