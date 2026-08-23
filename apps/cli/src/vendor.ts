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
