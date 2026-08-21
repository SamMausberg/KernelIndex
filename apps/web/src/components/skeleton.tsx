/** Layout-matching loading state (§16.18): quiet raised blocks in the rhythm
 * of the rows they stand in for. Deliberately static — no pulse, no shimmer;
 * nothing on this site repaints continuously. */
export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <output aria-label="Loading results" className="block">
      <div className="h-9 border-b border-border-strong" />
      {Array.from({ length: rows }, (_, index) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholders
          key={index}
          className="flex h-12 items-center gap-6 border-b border-line"
        >
          <span className="h-3 w-[26%] bg-raised" />
          <span className="h-3 w-[14%] bg-raised" />
          <span className="ml-auto h-3 w-[10%] bg-raised" />
          <span className="h-3 w-[8%] bg-raised" />
        </div>
      ))}
    </output>
  )
}
