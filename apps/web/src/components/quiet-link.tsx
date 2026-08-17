import NextLink from "next/link"
import type { ComponentProps } from "react"

/**
 * next/link with prefetch off. List surfaces render dozens of links, and
 * with `staleTimes.dynamic` enabled the viewport prefetch fetched a full
 * dynamic server render per link — /search and operation pages were being
 * rendered dozens of times per scroll, which was the site-wide lag.
 * Navigation still works normally; the target renders when clicked.
 */
export function Link(props: ComponentProps<typeof NextLink>) {
  return <NextLink prefetch={false} {...props} />
}
