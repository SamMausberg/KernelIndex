import { splitImplementationName } from "@/lib/names"

/**
 * Implementation name for list surfaces: generated identifiers render as a
 * readable base with the short id receding into a faint mono fragment
 * ("gpt-o3 / cuda 19c647"); every other name renders unchanged. Inherits
 * the caller's tone; canonical identifiers stay on the dossiers.
 */
export function ImplName({ name }: { name: string }) {
  const parts = splitImplementationName(name)
  if (!parts) return name
  return (
    <>
      {parts.base}
      <span className="ml-1.5 font-mono text-mini text-faint">{parts.id}</span>
    </>
  )
}
