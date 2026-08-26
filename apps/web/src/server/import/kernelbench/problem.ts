// KernelBench problem modules → static workload facts. A problem is a
// PyTorch `Model` plus `get_inputs()`, whose tensors are built from
// module-level integer constants (`N = 2048 * 2`, `input_shape = (3, 224,
// 224)`), so the exact shapes are readable without running Python. The
// grammar here is deliberately small: constants, tuples, `*splat`, integer
// arithmetic, `dtype=` keywords, and the dtype-casting method chain. A
// problem outside it is reported and skipped, never guessed (§14.8).
import { evaluateAxisExpression, kebab } from "../shared.ts"
import type { Level } from "./types.ts"

export type ProblemInput = {
  name: string
  /** Bound dims: a lowercase constant name (an axis) or a literal. */
  shape: (string | number)[]
  dtype: string
}

export type ProblemSpec = {
  number: number
  slug: string
  title: string
  family: string
  inputs: ProblemInput[]
  /** Integer constants each axis name binds to. */
  axes: Record<string, number>
  /** Named `get_init_inputs()` hyperparameters that resolve to numbers. */
  scalars: Record<string, number>
}

type Constant = number | (number | string)[]

const DTYPES: Record<string, string> = {
  float16: "fp16",
  half: "fp16",
  bfloat16: "bf16",
  float32: "fp32",
  float: "fp32",
  float64: "fp64",
  double: "fp64",
  int64: "int64",
  long: "int64",
  int32: "int32",
  int: "int32",
  bool: "bool",
}

/** Family keywords in priority order; the first filename token that
 * matches decides, so a level-2 fusion is filed under its leading op. */
const FAMILIES: [RegExp, string][] = [
  [/attention/, "attention"],
  [/layernorm/, "layernorm"],
  [/rmsnorm/, "rmsnorm"],
  [/groupnorm/, "groupnorm"],
  [/batchnorm/, "batchnorm"],
  [/instancenorm/, "instancenorm"],
  [/norm/, "normalization"],
  [/matmul|matrix|gemm|^bmm$|^mm$|linear/, "gemm"],
  [/conv/, "conv"],
  [/softmax/, "softmax"],
  [/pool/, "pooling"],
  [/crossentropy/, "cross-entropy"],
  [/^kl/, "kl-divergence"],
  [/cosine/, "cosine-similarity-loss"],
  [/loss|mse|hinge|huber|triplet|smoothl1/, "loss"],
  [/cumsum|cumprod|scan|exclusive/, "scan"],
  [/^(sum|mean|max|min|argmax|argmin|product|reduction|reduce)$/, "reduction"],
  [
    /relu|gelu|sigmoid|tanh|swish|silu|elu|selu|softplus|softsign|hardtanh|hardsigmoid|mish|swiglu|geglu/,
    "activation",
  ],
]

export function familyOf(level: Level, file: string): string {
  if (level === "level3") return "model"
  const tokens = file
    .replace(/\.py$/, "")
    .split("_")
    .slice(1)
    .map((token) => token.toLowerCase())
    .filter(Boolean)
  for (const token of tokens)
    for (const [pattern, family] of FAMILIES)
      if (pattern.test(token)) return family
  return "other"
}

/** "12_Matmul_with_diagonal_matrices_.py" → 12, "Matmul with diagonal matrices". */
function nameOf(file: string): { number: number; title: string } {
  const match = /^(\d+)_(.*)\.py$/.exec(file)
  if (!match) throw new Error(`unexpected problem file name '${file}'`)
  return {
    number: Number(match[1]),
    title: match[2].replaceAll("_", " ").replaceAll(/\s+/g, " ").trim(),
  }
}

/** Split `a, b, (c, d), e` on top-level commas only. */
function splitArgs(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ""
  for (const char of text) {
    if (char === "(" || char === "[") depth++
    if (char === ")" || char === "]") depth--
    if (char === "," && depth === 0) {
      parts.push(current.trim())
      current = ""
    } else current += char
  }
  if (current.trim() !== "") parts.push(current.trim())
  return parts
}

/** Evaluate an integer expression over the constants; null when it is not
 * one (floats, calls, strings, unknown names). */
function intExpr(
  text: string,
  constants: Map<string, Constant>,
): number | null {
  if (!/^[A-Za-z0-9_+\-*%/() ]+$/.test(text) || /\d\.\d|e-/.test(text))
    return null
  const bindings: Record<string, number> = {}
  for (const name of text.match(/[A-Za-z_]\w*/g) ?? []) {
    const value = constants.get(name)
    if (typeof value !== "number") return null
    bindings[name.toLowerCase()] = value
  }
  try {
    // A lone `/` is true division in Python; every problem that divides a
    // shape does so exactly, which `//` reproduces.
    const value = evaluateAxisExpression(
      text.toLowerCase().replaceAll(/(?<!\/)\/(?!\/)/g, "//"),
      bindings,
    )
    return Number.isInteger(value) && value > 0 ? value : null
  } catch {
    return null
  }
}

/** `(3, 224, 224)` / `[a, b]` → elements; null when one is not an integer. */
function tupleExpr(
  text: string,
  constants: Map<string, Constant>,
): (number | string)[] | null {
  const inner = /^[([]\s*([\s\S]*?)\s*,?\s*[)\]]$/.exec(text)
  if (!inner) return null
  const dims: (number | string)[] = []
  for (const part of splitArgs(inner[1])) {
    const dim = dimExpr(part, constants)
    if (dim === null) return null
    dims.push(...dim)
  }
  return dims
}

/** One shape argument → the dims it contributes: an axis name for a bare
 * integer constant, literals otherwise, a tuple's elements for splats. */
function dimExpr(
  text: string,
  constants: Map<string, Constant>,
): (number | string)[] | null {
  if (/^\d+$/.test(text)) return [Number(text)]
  if (/^[A-Za-z_]\w*$/.test(text)) {
    const value = constants.get(text)
    if (typeof value === "number") return [text.toLowerCase()]
    return value ?? null
  }
  if (text.startsWith("*")) {
    const value = constants.get(text.slice(1))
    return Array.isArray(value) ? value : null
  }
  if (/^[([]/.test(text)) return tupleExpr(text, constants)
  const value = intExpr(text, constants)
  return value === null ? null : [value]
}

/** Module-level `NAME = value` (and `a = b = value`) assignments. */
function readConstants(source: string): Map<string, Constant> {
  const constants = new Map<string, Constant>()
  const scalars = new Map<string, number>()
  for (const line of source.split("\n")) {
    // `depth, height, width = 24, 48, 48` unpacks positionally.
    const unpack =
      /^([A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)+)\s*=\s*([^#]+?)\s*(?:#.*)?$/.exec(
        line,
      )
    if (unpack) {
      const names = unpack[1].split(",").map((n) => n.trim())
      const values = splitArgs(unpack[2].trim())
      if (names.length === values.length)
        for (const [index, name] of names.entries()) {
          const value = intExpr(values[index], constants)
          if (value !== null) constants.set(name, value)
        }
      continue
    }
    const match = /^((?:[A-Za-z_]\w*\s*=\s*)+)(.+?)\s*(?:#.*)?$/.exec(line)
    if (!match || /^(def|class|import|from)\b/.test(line)) continue
    const names = match[1]
      .split("=")
      .map((n) => n.trim())
      .filter(Boolean)
    const text = match[2].trim()
    const value: Constant | null =
      intExpr(text, constants) ?? tupleExpr(text, constants)
    for (const name of names) {
      if (value !== null) constants.set(name, value)
      else if (/^-?\d+(\.\d+)?(e-?\d+)?$/i.test(text))
        scalars.set(name, Number(text))
    }
  }
  for (const [name, value] of scalars)
    if (!constants.has(name)) constants.set(`${name}\0float`, value)
  return constants
}

/** The body of `def name():` up to the next top-level statement. */
function functionBody(source: string, name: string): string | null {
  const match = new RegExp(
    `^def ${name}\\(\\):\\n((?:[ \\t]+.*\\n?|\\n)*)`,
    "m",
  ).exec(source)
  return match ? match[1] : null
}

/** Every `torch.<ctor>(...)` call in a body with its balanced argument text,
 * the assignment name feeding it, and the method chain after it. */
function tensorCalls(
  body: string,
): { name: string | null; ctor: string; args: string; chain: string }[] {
  const calls: {
    name: string | null
    ctor: string
    args: string
    chain: string
  }[] = []
  const pattern = /(?:([A-Za-z_]\w*)\s*=\s*)?torch\.(rand|randn|randint)\(/g
  for (let match = pattern.exec(body); match; match = pattern.exec(body)) {
    let depth = 1
    let end = pattern.lastIndex
    while (end < body.length && depth > 0) {
      if (body[end] === "(") depth++
      if (body[end] === ")") depth--
      end++
    }
    const chain = /^(?:\s*\.\w+\([^)]*\))*/.exec(body.slice(end))?.[0] ?? ""
    calls.push({
      name: match[1] ?? null,
      ctor: match[2],
      args: body.slice(pattern.lastIndex, end - 1),
      chain,
    })
    pattern.lastIndex = end
  }
  return calls
}

function dtypeOf(args: string[], chain: string, integer: boolean): string {
  const keyword = args.find((arg) => arg.startsWith("dtype="))
  const named = keyword ? /torch\.(\w+)/.exec(keyword)?.[1] : null
  const cast = [...chain.matchAll(/\.(\w+)\(/g)].map((m) => m[1]).reverse()
  const casted = cast.find((method) => method in DTYPES)
  return DTYPES[casted ?? named ?? ""] ?? (integer ? "int64" : "fp32")
}

export type ProblemOutcome =
  | { spec: ProblemSpec; problem?: undefined }
  | { spec?: undefined; problem: string }

/** Parse one problem module; the failure reason names what fell outside
 * the grammar so the review report can say why a problem is missing. */
export function parseProblem(
  level: Level,
  file: string,
  source: string,
): ProblemOutcome {
  const { number, title } = nameOf(file)
  const constants = readConstants(source)
  const body = functionBody(source, "get_inputs")
  if (body === null) return { problem: "no get_inputs()" }
  // Axis names are the lowercased constants; `N` and `n` must not both exist.
  const byAxis = new Map<string, number>()
  for (const [name, value] of constants)
    if (typeof value === "number" && !name.includes("\0")) {
      if (byAxis.has(name.toLowerCase()))
        return { problem: `axis name collision on '${name.toLowerCase()}'` }
      byAxis.set(name.toLowerCase(), value)
    }
  const inputs: ProblemInput[] = []
  const axes: Record<string, number> = {}
  for (const [index, call] of tensorCalls(body).entries()) {
    // `torch.rand(())` is a 0-d multiplier, not a workload tensor.
    if (call.args.trim() === "()" || call.args.trim() === "") continue
    const args = splitArgs(call.args)
    const positional = args.filter((arg) => !/^[A-Za-z_]\w*=/.test(arg))
    // randint(low, high, size): only the size shapes the tensor.
    const sizeArgs = call.ctor === "randint" ? positional.slice(2) : positional
    const shape: (string | number)[] = []
    for (const arg of sizeArgs) {
      const dims = dimExpr(arg, constants)
      if (dims === null)
        return { problem: `get_inputs() argument '${arg}' is not static` }
      shape.push(...dims)
    }
    if (shape.length === 0)
      return { problem: `torch.${call.ctor}() call has no static shape` }
    for (const dim of shape)
      if (typeof dim === "string") axes[dim] = byAxis.get(dim) as number
    inputs.push({
      name: call.name?.toLowerCase() ?? `input_${index + 1}`,
      shape,
      dtype: dtypeOf(args, call.chain, call.ctor === "randint"),
    })
  }
  if (inputs.length === 0) return { problem: "get_inputs() builds no tensor" }
  const scalars: Record<string, number> = {}
  const init = functionBody(source, "get_init_inputs")
  const returned = init ? /return\s*\[([\s\S]*?)\]/.exec(init)?.[1] : null
  for (const item of returned ? splitArgs(returned) : []) {
    const value = constants.get(item) ?? constants.get(`${item}\0float`) ?? null
    if (typeof value === "number") scalars[item.toLowerCase()] = value
  }
  return {
    spec: {
      number,
      slug: kebab(
        `${level.replace("level", "l")}-${file.replace(/\.py$/, "")}`,
      ),
      title,
      family: familyOf(level, file),
      inputs,
      axes,
      scalars,
    },
  }
}
