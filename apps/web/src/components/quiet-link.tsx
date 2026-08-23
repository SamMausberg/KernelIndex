"use client"

import NextLink from "next/link"
import { useRouter } from "next/navigation"
import { type ComponentProps, useRef } from "react"

/**
 * next/link with viewport prefetch off and hover-intent prefetch on. List
 * surfaces render dozens of links, and with `staleTimes.dynamic` enabled the
 * viewport prefetch fetched a full dynamic server render per link — /search
 * and operation pages were being rendered dozens of times per scroll, which
 * was the site-wide lag. Instead a link prefetches once when the pointer
 * rests on it for a beat (or it receives keyboard focus), so an intended
 * click lands on a warm router cache; a cursor sweeping across a table
 * prefetches nothing. Same-pathname links (workload/cohort/filter selections
 * the islands intercept client-side) never prefetch.
 */
const HOVER_INTENT_MS = 80

export function Link(props: ComponentProps<typeof NextLink>) {
  const router = useRouter()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const done = useRef(false)

  const prefetch = () => {
    done.current = true
    const href = typeof props.href === "string" ? props.href : null
    if (!href?.startsWith("/")) return
    if (href.split("?")[0] === window.location.pathname) return
    router.prefetch(href)
  }
  const enter = (event: React.PointerEvent<HTMLAnchorElement>) => {
    props.onPointerEnter?.(event)
    if (done.current) return
    timer.current = setTimeout(prefetch, HOVER_INTENT_MS)
  }
  const leave = (event: React.PointerEvent<HTMLAnchorElement>) => {
    props.onPointerLeave?.(event)
    if (timer.current !== null) clearTimeout(timer.current)
  }
  // Press is the last moment worth acting on, and on touch it is the only
  // one: a tap has no hover, so hover intent alone left every mobile
  // navigation cold. Pointer-down still lands a few frames before the click.
  const down = (event: React.PointerEvent<HTMLAnchorElement>) => {
    props.onPointerDown?.(event)
    if (!done.current) prefetch()
  }
  const focus = (event: React.FocusEvent<HTMLAnchorElement>) => {
    props.onFocus?.(event)
    if (!done.current) prefetch()
  }

  return (
    <NextLink
      prefetch={false}
      {...props}
      onPointerEnter={enter}
      onPointerLeave={leave}
      onPointerDown={down}
      onFocus={focus}
    />
  )
}
