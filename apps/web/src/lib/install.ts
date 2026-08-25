// Install-line pinning vocabulary (§8.15), shared by publication, the read
// seam, and the pages that render commands.

/**
 * Whether an install line resolves to the measured code: pip pins with
 * `==version` (or a direct `@ref`), git with `@commit`, containers with an
 * image tag. Commands are either synthesized by publication or declared
 * verbatim by a source, so the textual test is exact for catalog output.
 */
export function installIsPinned(kind: string, command: string): boolean {
  if (kind === "pip") return command.includes("==") || command.includes("@")
  if (kind === "git") return /@[^/\s]+$/.test(command)
  if (kind === "container") return /:[^/\s]+$/.test(command)
  return false
}

/** Rewrites a synthesized pip line to a specific measured version — the
 * per-run pin when one row's evidence predates the newest measured release.
 * Matches only the exact shape installCommandOf emits; a source-declared
 * command (extra flags, index URLs) passes through untouched. */
export function pinPipCommand(command: string, version: string): string {
  const name = command.match(
    /^pip install "?([A-Za-z0-9._-]+)(?:==[^\s"]+)?"?$/,
  )?.[1]
  return name ? `pip install "${name}==${version}"` : command
}
