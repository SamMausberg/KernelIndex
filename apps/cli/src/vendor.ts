import { mkdirSync, realpathSync, writeFileSync } from "node:fs"
import { isAbsolute, join, relative, resolve, sep } from "node:path"
import type { ImplementationDossier } from "@kernelindex/sdk"

const COMMENT: Record<string, string> = { python: "#", cpp: "//", text: "#" }
const EXTENSION: Record<string, string> = {
  python: "py",
  cpp: "cpp",
  text: "txt",
}

export type VendorPlan =
  | { kind: "install"; command: string; installKind: string }
  | {
      kind: "vendor"
      fileName: string
      content: string
      license: string | null
    }
  | { kind: "none"; reason: string }

const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const INVALID_COMPONENT = /[<>:"|?*\\]/

function pathComponents(
  value: string,
  label: string,
  allowNested: boolean,
): string[] {
  const parts = value.split("/")
  if (
    value.length === 0 ||
    isAbsolute(value) ||
    (!allowNested && parts.length !== 1) ||
    parts.some(
      (part) =>
        part.length === 0 ||
        part === "." ||
        part === ".." ||
        part.endsWith(".") ||
        part.endsWith(" ") ||
        INVALID_COMPONENT.test(part) ||
        [...part].some((character) => character.charCodeAt(0) < 32) ||
        WINDOWS_DEVICE.test(part),
    )
  )
    throw new Error(`unsafe ${label} '${value}'`)
  return parts
}

function isWithin(root: string, candidate: string): boolean {
  const path = relative(root, candidate)
  return (
    path === "" ||
    (!isAbsolute(path) && path !== ".." && !path.startsWith(`..${sep}`))
  )
}

/** Writes remote source beneath the caller's output root without following
 * directory links out of it or replacing an existing file. */
export function writeVendoredSource(
  root: string,
  directory: string | null,
  fileName: string,
  content: string,
): string {
  const directoryParts =
    directory === null
      ? []
      : pathComponents(directory, "implementation slug", false)
  const fileParts = pathComponents(fileName, "source filename", true)
  const displayPath = join(root, ...directoryParts, ...fileParts)
  const rootPath = resolve(root)
  mkdirSync(rootPath, { recursive: true })
  const canonicalRoot = realpathSync(rootPath)

  let parent = canonicalRoot
  for (const part of [...directoryParts, ...fileParts.slice(0, -1)]) {
    const next = join(parent, part)
    try {
      mkdirSync(next)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
    }
    const canonical = realpathSync(next)
    if (!isWithin(canonicalRoot, canonical))
      throw new Error(`unsafe source path '${fileName}'`)
    parent = canonical
  }

  try {
    writeFileSync(join(parent, fileParts.at(-1) as string), content, {
      flag: "wx",
    })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new Error(`refusing to overwrite '${displayPath}'`)
    throw error
  }
  return displayPath
}

/**
 * The adoption path for one implementation dossier (`ki use`, §13.8): a
 * verified install command when a package exists, otherwise the mirrored
 * source with its provenance (source, commit, digest, license, attribution)
 * recorded in a header comment. No public source refuses; nothing is
 * fabricated.
 */
export function vendorPlan(
  model: ImplementationDossier,
  retrievedAt: string,
): VendorPlan {
  if (model.usage.install) {
    return {
      kind: "install",
      command: model.usage.install.command,
      installKind: model.usage.install.kind,
    }
  }
  const code = model.sourceCode
  if (!code?.content) {
    return {
      kind: "none",
      reason: `No public source for ${model.implementation.slug}: benchmark evidence only.`,
    }
  }
  const mark = COMMENT[code.language] ?? "#"
  const license =
    code.license ?? model.license.concluded ?? model.license.declared
  const header = [
    `Vendored from KernelIndex · https://kernelindex.com/implementations/${model.implementation.slug}`,
    `${model.implementation.name} · ${model.project.name}`,
    ...(model.source.url ? [`source ${model.source.url}`] : []),
    ...(model.source.commit ? [`commit ${model.source.commit}`] : []),
    `revision digest ${model.implementation.digest}`,
    `license ${license ?? "unknown"}`,
    ...(code.attribution
      ? [
          code.attribution.text +
            (code.attribution.url ? ` · ${code.attribution.url}` : ""),
        ]
      : []),
    `retrieved ${retrievedAt}`,
  ].map((line) => `${mark} ${line}`)
  return {
    kind: "vendor",
    fileName:
      code.fileName ??
      `${model.implementation.slug}.${EXTENSION[code.language] ?? "txt"}`,
    content: `${header.join("\n")}\n\n${code.content}`,
    license,
  }
}
