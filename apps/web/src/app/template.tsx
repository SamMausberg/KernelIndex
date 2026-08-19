import type { ReactNode } from "react"

/** Route-transition tell (§16.2): the instrument's sweep — a flat accent
 * hairline crossing the page once. A template remounts per navigation, so
 * the sweep replays exactly when the page changes and nowhere else. */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="scan-line" />
      {children}
    </>
  )
}
