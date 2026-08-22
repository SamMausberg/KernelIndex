// Machine-readable exports of a comparison (§16.11). Pure projections of the
// compare model so the copied artifact always matches the rendered page.
import type { ComparePageModel } from "./catalog-models"
import { formatPrimary } from "./format"

export function compareMarkdown(model: ComparePageModel): string {
  const names = model.runs.map((run) => run.implementation.name)
  const header = `| field | ${names.join(" | ")} |`
  const divider = `|---|${names.map(() => "---").join("|")}|`
  const metricRow = `| primary | ${model.runs
    .map((run) =>
      run.primary
        ? `${formatPrimary(run.primary)}${run.rank !== null ? ` (#${run.rank}${run.tiedWithPrevious ? "=" : ""})` : ""}`
        : "—",
    )
    .join(" | ")} |`
  const rows = model.fields.map(
    (field) =>
      `| ${field.field}${field.material ? " *" : ""} | ${field.values
        .map((value) => value ?? "unknown")
        .join(" | ")} |`,
  )
  return [
    `# KernelIndex comparison`,
    "",
    model.explanation,
    "",
    header,
    divider,
    metricRow,
    ...rows,
    "",
    `\\* cohort-identity field · policy ${model.policyVersion}`,
  ].join("\n")
}

export function compareJson(model: ComparePageModel): string {
  return JSON.stringify(
    {
      policyVersion: model.policyVersion,
      comparable: model.comparable,
      profile: model.profile,
      comparisonKey: model.comparisonKey,
      firstMaterialMismatch: model.firstMaterialMismatch,
      explanation: model.explanation,
      runs: model.runs,
      fields: model.fields,
    },
    null,
    2,
  )
}

/** One row per field, the primary measurement first; every cell quoted. */
export function compareCsv(model: ComparePageModel): string {
  const quote = (cell: string | null) =>
    `"${(cell ?? "unknown").replaceAll('"', '""')}"`
  const rows: (string | null)[][] = [
    ["field", ...model.runs.map((run) => run.implementation.name)],
    [
      "primary",
      ...model.runs.map((run) =>
        run.primary ? formatPrimary(run.primary) : "",
      ),
    ],
    ...model.fields.map((field) => [field.field, ...field.values]),
  ]
  return rows.map((row) => row.map(quote).join(",")).join("\n")
}
