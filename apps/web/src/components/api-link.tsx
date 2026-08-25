/** The page's machine twin (§16.18): every dossier links its own /api/v1
 * JSON, the same model the page rendered — from the page-end footer note,
 * past the answer, never in the header's first three seconds (§16 brief). */
export function ApiLink({ path }: { path: string }) {
  return (
    <a
      href={`/api/v1${path}`}
      className="font-mono text-small text-faint transition-colors hover:text-fg no-underline"
    >
      JSON
    </a>
  )
}
