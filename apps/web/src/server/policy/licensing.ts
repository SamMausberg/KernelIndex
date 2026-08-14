// License normalization (§8.15). Declared and concluded licenses stay
// separate: a conclusion exists only when the declared expression is valid
// SPDX. Unknown never silently becomes permissive (§2.2 "no license
// laundering").
import spdxParse from "spdx-expression-parse"
import spdxLicenseList from "spdx-license-list"

const idsByLowercase = new Map(
  Object.keys(spdxLicenseList).map((id) => [id.toLowerCase(), id]),
)

export type LicenseConclusion = {
  declared: string | null
  concluded: string | null
}

/**
 * Normalize a declared license string. A single license identifier is
 * case-corrected against the SPDX list; a full expression must already be
 * valid SPDX. Anything unparseable concludes to null (unknown).
 */
export function concludeLicense(
  declared: string | null | undefined,
): LicenseConclusion {
  if (!declared || declared.trim() === "")
    return { declared: null, concluded: null }
  const raw = declared.trim()
  const caseCorrected = idsByLowercase.get(raw.toLowerCase()) ?? raw
  try {
    spdxParse(caseCorrected)
    return { declared: raw, concluded: caseCorrected }
  } catch {
    return { declared: raw, concluded: null }
  }
}
