// Deterministic search-query parser (§12.2–12.3). One query string becomes a
// typed SearchIntent: recognized facets narrow the workload, unknown filters
// produce a correction hint instead of silent free text, and the remaining
// terms resolve the operation. Pure module: both catalog backends and the
// search UI share it, so fixture and PostgreSQL mode interpret one grammar.
import type { EvidenceLevel } from "./catalog-models"

export type QueryFacet = {
  /** Raw token exactly as typed, used to remove the facet from the query. */
  token: string
  field: string
  /** Compact display, e.g. "gpu B200" or "tokens = 2048". */
  display: string
}

export type QueryIssue = { token: string; message: string }

export type SearchIntent = {
  /** Free-text terms left for operation resolution. */
  text: string[]
  family: string | null
  /** Model workload provenance (model:deepseek-v3); prefix-matches op tags. */
  model: string | null
  gpu: string | null
  architecture: string | null
  dtypes: string[]
  shape: number[] | null
  axes: Record<string, number>
  layout: string | null
  framework: string | null
  language: string | null
  cudaMajor: number | null
  /** Policy facets (§11.4 step 10): filters, never comparability. */
  minimumTrust: EvidenceLevel | null
  license: string | null
  requireSource: boolean
  requireInstallable: boolean
  /** Technique traits every shown implementation must carry (tech:tma). */
  techniques: string[]
  facets: QueryFacet[]
  issues: QueryIssue[]
}

const DTYPE_ALIASES: Record<string, string> = {
  bf16: "bf16",
  bfloat16: "bf16",
  fp16: "fp16",
  f16: "fp16",
  half: "fp16",
  fp32: "fp32",
  f32: "fp32",
  float32: "fp32",
  tf32: "tf32",
  fp64: "fp64",
  fp8: "fp8",
  e4m3: "e4m3",
  e5m2: "e5m2",
  fp8_e4m3: "fp8_e4m3",
  fp8_e4m3fnuz: "fp8_e4m3fnuz",
  fp8_e8m0: "fp8_e8m0",
  fp4: "fp4",
  nvfp4: "nvfp4",
  mxfp4: "mxfp4",
  int8: "int8",
  int4: "int4",
  uint8: "uint8",
  int32: "int32",
  int64: "int64",
}

/** Bare hardware words that deterministically mean a GPU product. */
const GPU_WORDS = new Set([
  "b100",
  "b200",
  "gb200",
  "h100",
  "h200",
  "h800",
  "a100",
  "a800",
  "l40s",
  "mi300x",
  "mi325x",
])

const LANGUAGE_WORDS = new Set(["triton", "cuda", "cutlass", "ptx", "tilelang"])
const FRAMEWORK_ALIASES: Record<string, string> = {
  pytorch: "pytorch",
  torch: "pytorch",
}
const TRUST_LEVELS = new Set<EvidenceLevel>([
  "verified",
  "replicated",
  "reproducible",
  "reported",
])
const LAYOUT_ALIASES: Record<string, string> = {
  row_major: "row_major",
  "row-major": "row_major",
  col_major: "col_major",
  "col-major": "col_major",
  contiguous: "contiguous",
  strided: "strided",
}

/** key:value / key=value vocabulary (§12.2); aliases map to one field. */
const KEY_ALIASES: Record<string, string> = {
  op: "op",
  operation: "op",
  family: "family",
  model: "model",
  gpu: "gpu",
  hardware: "gpu",
  arch: "arch",
  dtype: "dtype",
  shape: "shape",
  layout: "layout",
  framework: "framework",
  language: "language",
  lang: "language",
  cuda: "cuda",
  trust: "trust",
  evidence: "trust",
  license: "license",
  source: "source",
  source_available: "source",
  installable: "installable",
  tech: "tech",
  technique: "tech",
}

function parseShape(value: string): number[] | null {
  const inner = value.match(/^\[(.*)\]$/)?.[1] ?? value
  const parts = inner.includes("x") ? inner.split("x") : inner.split(",")
  const dims = parts.map((part) => Number.parseInt(part.trim(), 10))
  if (
    dims.length === 0 ||
    dims.some((dim) => !Number.isInteger(dim) || dim < 0)
  )
    return null
  return dims
}

function parseBoolean(value: string): boolean | null {
  if (value === "true" || value === "yes" || value === "1") return true
  if (value === "false" || value === "no" || value === "0") return false
  return null
}

function nearestKey(key: string): string | null {
  const candidates = Object.keys(KEY_ALIASES)
  return (
    candidates.find(
      (candidate) =>
        candidate.startsWith(key.slice(0, 3)) || key.startsWith(candidate),
    ) ?? null
  )
}

/** Rewrite the query with one facet token removed (editable tokens, §16.6). */
export function removeToken(query: string, token: string): string {
  return tokenize(query)
    .filter((candidate) => candidate !== token)
    .join(" ")
}

/** Bracket groups (shapes with spaces) and quoted strings stay one token. */
function tokenize(query: string): string[] {
  return query.match(/"[^"]*"|\S*\[[^\]]*\]|\S+/g) ?? []
}

export function parseQuery(query: string): SearchIntent {
  const intent: SearchIntent = {
    text: [],
    family: null,
    model: null,
    gpu: null,
    architecture: null,
    dtypes: [],
    shape: null,
    axes: {},
    layout: null,
    framework: null,
    language: null,
    cudaMajor: null,
    minimumTrust: null,
    license: null,
    requireSource: false,
    requireInstallable: false,
    techniques: [],
    facets: [],
    issues: [],
  }
  const facet = (token: string, field: string, display: string) =>
    intent.facets.push({ token, field, display })
  const issue = (token: string, message: string) =>
    intent.issues.push({ token, message })

  const keyed = (token: string, rawKey: string, value: string) => {
    const key = KEY_ALIASES[rawKey.toLowerCase()]
    const lower = value.toLowerCase()
    if (key === undefined) {
      // A lowercase name bound to an integer is an axis binding (tokens=2048).
      const axisValue = Number.parseInt(value, 10)
      if (/^[a-z][a-z0-9_]*$/.test(rawKey) && /^\d+$/.test(value)) {
        intent.axes[rawKey] = axisValue
        facet(token, "axis", `${rawKey} = ${axisValue}`)
        return
      }
      const hint = nearestKey(rawKey.toLowerCase())
      issue(
        token,
        `unknown filter '${rawKey}'${hint ? `. Did you mean '${hint}:'?` : ""}`,
      )
      return
    }
    if (/^(>=|<=|>|<)/.test(value)) {
      issue(token, `range filters are not supported yet; use an exact value`)
      return
    }
    switch (key) {
      case "op":
        intent.text.push(lower)
        facet(token, "op", `operation ${lower}`)
        return
      case "family":
        intent.family = lower
        facet(token, "family", `family ${lower}`)
        return
      case "model":
        // Kebab-normalized to match stored model:<slug> operation tags.
        intent.model = lower
          .replaceAll(/[^a-z0-9]+/g, "-")
          .replaceAll(/^-+|-+$/g, "")
        facet(token, "model", `model ${intent.model}`)
        return
      case "gpu":
        intent.gpu = value
        facet(token, "gpu", `gpu ${value}`)
        return
      case "arch": {
        const match = lower.match(/^sm_?(\d+)$/)
        if (!match) return issue(token, `unrecognized architecture '${value}'`)
        intent.architecture = `sm_${match[1]}`
        facet(token, "arch", `arch sm_${match[1]}`)
        return
      }
      case "dtype": {
        const dtype = DTYPE_ALIASES[lower]
        if (!dtype) return issue(token, `unknown dtype '${value}'`)
        if (!intent.dtypes.includes(dtype)) intent.dtypes.push(dtype)
        facet(token, "dtype", `dtype ${dtype}`)
        return
      }
      case "shape": {
        const shape = parseShape(lower)
        if (!shape) return issue(token, `unparseable shape '${value}'`)
        intent.shape = shape
        facet(token, "shape", `shape [${shape.join(", ")}]`)
        return
      }
      case "layout": {
        const layout = LAYOUT_ALIASES[lower]
        if (!layout) return issue(token, `unknown layout '${value}'`)
        intent.layout = layout
        facet(token, "layout", `layout ${layout}`)
        return
      }
      case "framework":
        intent.framework = FRAMEWORK_ALIASES[lower] ?? lower
        facet(token, "framework", `framework ${intent.framework}`)
        return
      case "language":
        intent.language = lower
        facet(token, "language", `language ${lower}`)
        return
      case "cuda": {
        const major = Number.parseInt(lower, 10)
        if (Number.isNaN(major))
          return issue(token, `unparseable CUDA version '${value}'`)
        intent.cudaMajor = major
        facet(token, "cuda", `cuda ${lower}`)
        return
      }
      case "trust": {
        if (!TRUST_LEVELS.has(lower as EvidenceLevel))
          return issue(
            token,
            `unknown trust level '${value}': one of verified, replicated, reproducible, reported`,
          )
        intent.minimumTrust = lower as EvidenceLevel
        facet(token, "trust", `trust ≥ ${lower}`)
        return
      }
      case "license":
        intent.license = lower
        facet(token, "license", `license ${lower}`)
        return
      case "source": {
        const flag = parseBoolean(lower)
        if (flag === null)
          return issue(token, `'source' expects true or false, got '${value}'`)
        intent.requireSource = flag
        facet(token, "source", `source ${flag ? "required" : "optional"}`)
        return
      }
      case "installable": {
        const flag = parseBoolean(lower)
        if (flag === null)
          return issue(
            token,
            `'installable' expects true or false, got '${value}'`,
          )
        intent.requireInstallable = flag
        facet(token, "installable", flag ? "installable" : "any install state")
        return
      }
      case "tech": {
        const trait = lower.replaceAll("_", "-")
        if (!intent.techniques.includes(trait)) intent.techniques.push(trait)
        facet(token, "tech", `uses ${trait}`)
        return
      }
    }
  }

  for (const token of tokenize(query.trim())) {
    if (token === "") continue
    if (token.startsWith('"') && token.endsWith('"')) {
      const term = token.slice(1, -1).trim().toLowerCase()
      if (term !== "") intent.text.push(term)
      continue
    }
    const pair = token.match(/^([a-zA-Z_]+)[:=](.+)$/)
    if (pair) {
      keyed(token, pair[1], pair[2])
      continue
    }
    const lower = token.toLowerCase()
    if (/^\[.*\]$/.test(token) || /^\d+x[\dx]+$/.test(lower)) {
      const shape = parseShape(lower)
      if (shape) {
        intent.shape = shape
        facet(token, "shape", `shape [${shape.join(", ")}]`)
      } else issue(token, `unparseable shape '${token}'`)
      continue
    }
    if (DTYPE_ALIASES[lower]) {
      const dtype = DTYPE_ALIASES[lower]
      if (!intent.dtypes.includes(dtype)) intent.dtypes.push(dtype)
      facet(token, "dtype", `dtype ${dtype}`)
      continue
    }
    if (GPU_WORDS.has(lower)) {
      intent.gpu = token.toUpperCase()
      facet(token, "gpu", `gpu ${token.toUpperCase()}`)
      continue
    }
    const arch = lower.match(/^sm_?(\d+)$/)
    if (arch) {
      intent.architecture = `sm_${arch[1]}`
      facet(token, "arch", `arch sm_${arch[1]}`)
      continue
    }
    if (FRAMEWORK_ALIASES[lower]) {
      intent.framework = FRAMEWORK_ALIASES[lower]
      facet(token, "framework", `framework ${FRAMEWORK_ALIASES[lower]}`)
      continue
    }
    if (LANGUAGE_WORDS.has(lower)) {
      intent.language = lower
      facet(token, "language", `language ${lower}`)
      continue
    }
    if (TRUST_LEVELS.has(lower as EvidenceLevel)) {
      intent.minimumTrust = lower as EvidenceLevel
      facet(token, "trust", `trust ≥ ${lower}`)
      continue
    }
    intent.text.push(lower)
  }
  return intent
}

const TRUST_RANK: Record<EvidenceLevel, number> = {
  replicated: 4,
  verified: 3,
  reproducible: 2,
  reported: 1,
}

/** Does a row's derived evidence level satisfy a `trust:` minimum (§12.2)? */
export function meetsTrust(
  evidence: EvidenceLevel | null,
  minimum: EvidenceLevel | null,
): boolean {
  if (minimum === null) return true
  if (evidence === null) return false
  return TRUST_RANK[evidence] >= TRUST_RANK[minimum]
}

/** Plain-language interpretation shown above results (§16.6). */
export function describeIntent(
  intent: SearchIntent,
  operationName: string | null,
): string {
  const parts = [
    operationName ? `Operation ${operationName}` : null,
    ...intent.facets
      .filter((entry) => entry.field !== "op")
      .map((entry) => entry.display),
  ].filter(Boolean)
  if (parts.length === 0) return "Search the index"
  return parts.join(" · ")
}
