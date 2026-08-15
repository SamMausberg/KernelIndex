"use client"

import { useRouter } from "next/navigation"

/**
 * The homepage's primary search. On submit the bar morphs into the search
 * page's workload field (the prototype's FLIP transition): the clone starts
 * at the hero rect, navigation begins immediately, and the flight lands on
 * the real `#workload-search` element once it exists. Plain GET fallback
 * without JavaScript; no motion under prefers-reduced-motion.
 */
export function HeroSearch() {
  const router = useRouter()

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const input = form.elements.namedItem("q") as HTMLInputElement
    const query = input.value.trim()
    const href = `/search?q=${encodeURIComponent(query)}`
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches
    if (reduced) {
      router.push(href)
      return
    }

    const from = form.getBoundingClientRect()
    const clone = form.cloneNode(true) as HTMLElement
    const cloneInput = clone.querySelector("input")
    if (cloneInput) cloneInput.value = query
    Object.assign(clone.style, {
      position: "fixed",
      margin: "0",
      zIndex: "120",
      pointerEvents: "none",
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
    })
    document.body.appendChild(clone)

    form.style.opacity = "0"
    const hero = form.closest<HTMLElement>("[data-hero]")
    if (hero) {
      hero.style.transition =
        "opacity .12s linear, transform .18s cubic-bezier(.4,0,1,1)"
      hero.style.opacity = "0"
      hero.style.transform = "translateY(-12px)"
    }
    router.push(href)

    // Land on the destination field once the search page has rendered it.
    const startedAt = performance.now()
    const land = () => {
      const target = document.getElementById("workload-search")
      if (!target || target === form) {
        if (performance.now() - startedAt > 600) clone.remove()
        else requestAnimationFrame(land)
        return
      }
      const to = target.getBoundingClientRect()
      target.style.opacity = "0"
      const flight = clone.animate(
        [
          {
            left: `${from.left}px`,
            top: `${from.top}px`,
            width: `${from.width}px`,
            height: `${from.height}px`,
          },
          {
            left: `${to.left}px`,
            top: `${to.top}px`,
            width: `${to.width}px`,
            height: `${to.height}px`,
          },
        ],
        { duration: 220, easing: "cubic-bezier(.22,.7,.2,1)", fill: "both" },
      )
      flight.finished.finally(() => {
        target.style.opacity = ""
        clone.remove()
      })
    }
    requestAnimationFrame(land)
  }

  return (
    <form
      action="/search"
      onSubmit={submit}
      className="well mt-7 flex h-[46px] max-w-[620px] items-center gap-3 pr-2 pl-4"
    >
      <input
        name="q"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search operation, GPU, dtype, shape, framework…"
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[14px] outline-none"
      />
      <button
        type="submit"
        aria-label="Search"
        className="key flex-none cursor-pointer px-2 pb-[2px] font-mono text-[12.5px] text-faint hover:text-fg"
      >
        ↵
      </button>
    </form>
  )
}
