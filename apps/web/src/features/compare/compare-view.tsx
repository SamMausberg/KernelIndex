import { CopyButton } from "@/components/copy-button"
import { Link } from "@/components/quiet-link"
import type { ComparePageModel, CompareRun } from "@/lib/catalog"
import { compareJson, compareMarkdown } from "@/lib/compare-export"
import {
  evidenceLabel,
  formatDateUTC,
  formatPrimary,
  formatSpread,
} from "@/lib/format"

/** Grid template: one label column plus one aligned column per run. */
function columns(count: number) {
  return { gridTemplateColumns: `150px repeat(${count}, minmax(200px, 1fr))` }
}

function RunHeader({ run }: { run: CompareRun }) {
  const strong = run.evidence === "verified" || run.evidence === "replicated"
  return (
    <div className="min-w-0 py-3 pr-4">
      <div className="flex items-baseline gap-2">
        {run.rank !== null && (
          <span
            className={`font-mono text-small ${run.rank === 1 ? "text-fg" : "text-faint"}`}
          >
            #{run.rank}
            {run.tiedWithPrevious ? "=" : ""}
          </span>
        )}
        <Link
          href={`/implementations/${run.implementation.slug}`}
          className="truncate font-mono text-body"
        >
          {run.implementation.name}
        </Link>
      </div>
      <div className="mt-1.5 font-mono text-title text-fg">
        {run.primary ? formatPrimary(run.primary) : "—"}
        {run.primary && (
          <span className="ml-1.5 text-mini text-faint">
            {formatSpread(run.primary)}
          </span>
        )}
      </div>
      <div className="mt-1 text-small text-subtle">
        {strong && <span className="mr-1 text-label text-success">●</span>}
        {evidenceLabel(run.evidence)}
        {" · "}
        <Link href={`/runs/${run.runId}`}>run detail</Link>
      </div>
      {!run.eligible && (
        <div className="mt-1 text-mini text-warning">
          Ineligible: {run.ineligibleReasons.join(", ")}
        </div>
      )}
    </div>
  )
}

export function CompareView({ model }: { model: ComparePageModel }) {
  if (model.runs.length === 0) {
    return (
      <main className="shell animate-fade-in pb-24 pt-10">
        <p className="max-w-[64ch] text-body text-muted">{model.explanation}</p>
        {model.missingIds.length > 0 && (
          <p className="mt-3 font-mono text-small text-warning">
            Not found: {model.missingIds.join(", ")}
          </p>
        )}
        <p className="mt-4 text-body text-subtle">
          Pick runs from any <Link href="/search">search result</Link> or the{" "}
          <Link href="/records">records ledger</Link>. Each row links here.
        </p>
      </main>
    )
  }

  const identity = model.fields.filter((field) => field.material)
  const context = model.fields.filter((field) => !field.material)
  const markdown = compareMarkdown(model)
  const json = compareJson(model)

  return (
    <main className="shell animate-fade-in pb-24">
      <section
        className={`mt-6 border px-4 py-3 text-body ${
          model.comparable
            ? "border-border bg-surface text-muted"
            : "border-warning/40 bg-raised text-warning"
        }`}
      >
        {model.explanation}
        {!model.comparable && model.firstMaterialMismatch && (
          <span className="ml-2 text-small text-subtle">
            First material mismatch:{" "}
            <span className="font-mono">{model.firstMaterialMismatch}</span>.
          </span>
        )}
      </section>

      {model.missingIds.length > 0 && (
        <p className="mt-3 font-mono text-small text-warning">
          Not found: {model.missingIds.join(", ")}
        </p>
      )}

      <div className="mt-6 overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className="grid border-b border-border-strong"
            style={columns(model.runs.length)}
          >
            <div className="self-end py-2 text-mini text-faint">
              {model.comparable
                ? `ranked under ${model.policyVersion}`
                : "no ranks: not comparable"}
            </div>
            {model.runs.map((run) => (
              <RunHeader key={run.runId} run={run} />
            ))}
          </div>

          <div
            className="grid items-baseline border-b border-line"
            style={columns(model.runs.length)}
          >
            <div className="py-2.5 text-label text-faint uppercase">
              Comparison identity
            </div>
          </div>
          {identity.map((field) => (
            <div
              key={field.field}
              className="grid items-baseline border-b border-line transition-colors hover:bg-raised"
              style={columns(model.runs.length)}
            >
              <div
                className={`py-2.5 pr-3 text-small ${
                  field.differs ? "text-warning" : "text-subtle"
                }`}
              >
                {field.field}
                {field.differs && " ≠"}
              </div>
              {field.values.map((value, index) => (
                <div
                  key={`${field.field}-${model.runs[index].runId}`}
                  className={`min-w-0 truncate py-2.5 pr-4 font-mono text-small ${
                    field.differs ? "text-fg" : "text-muted"
                  }`}
                >
                  {value ?? "unknown"}
                </div>
              ))}
            </div>
          ))}

          <div
            className="grid items-baseline border-b border-line"
            style={columns(model.runs.length)}
          >
            <div className="pt-4 pb-2.5 text-label text-faint uppercase">
              Context
            </div>
          </div>
          {context.map((field) => (
            <div
              key={field.field}
              className="grid items-baseline border-b border-line transition-colors hover:bg-raised"
              style={columns(model.runs.length)}
            >
              <div className="py-2.5 pr-3 text-small text-subtle">
                {field.field}
              </div>
              {field.values.map((value, index) => (
                <div
                  key={`${field.field}-${model.runs[index].runId}`}
                  className={`min-w-0 truncate py-2.5 pr-4 font-mono text-small ${
                    field.differs ? "text-fg" : "text-muted"
                  }`}
                >
                  {value ?? "unknown"}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-5 border-t border-border pt-5">
        <p className="max-w-[70ch] text-small text-subtle">
          {model.comparable
            ? "Ranks compare only these runs. Too close to call shares a rank."
            : "No winner: these runs didn't measure the same thing. The rows above show what differs."}{" "}
          <Link href="/docs#comparability">Why comparable?</Link>
        </p>
        <div className="flex items-center gap-4 text-small">
          <span className="flex items-center gap-1.5 text-subtle">
            Markdown <CopyButton text={markdown} />
          </span>
          <span className="flex items-center gap-1.5 text-subtle">
            JSON <CopyButton text={json} />
          </span>
        </div>
      </div>
      {model.runs.map((run) => (
        <p key={run.runId} className="mt-2 font-mono text-mini text-faint">
          {run.implementation.name} · {run.digest.slice(0, 20)}… · observed{" "}
          {formatDateUTC(run.observedAt)}
        </p>
      ))}
    </main>
  )
}
