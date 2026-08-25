import { CopyButton } from "@/components/copy-button"
import { Link } from "@/components/quiet-link"
import type { ComparePageModel, CompareRun } from "@/lib/catalog"
import { compareCsv, compareJson, compareMarkdown } from "@/lib/compare-export"
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
      {/* An eligibility fact; the verdict panel carries the caveat. */}
      {!run.eligible && (
        <div className="mt-1 text-mini text-subtle">
          Ineligible: {run.ineligibleReasons.join(", ")}
        </div>
      )}
    </div>
  )
}

/** Add a run by id (§16.11: two to eight). A plain GET form: the selection
 * stays in the URL, and the existing runs ride along as hidden fields. */
function AddRun({ runs }: { runs: string[] }) {
  return (
    <form
      method="GET"
      action="/compare"
      className="well flex h-8 w-[300px] max-w-full items-center px-2.5"
    >
      {runs.map((id) => (
        <input key={id} type="hidden" name="run" value={id} />
      ))}
      <input
        name="run"
        placeholder="add a run id"
        aria-label="Add a run"
        autoComplete="off"
        spellCheck={false}
        className="min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-small outline-none"
      />
    </form>
  )
}

export function CompareView({ model }: { model: ComparePageModel }) {
  if (model.runs.length === 0) {
    return (
      <main className="shell pb-24 pt-10">
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
        <div className="mt-4">
          <AddRun runs={[]} />
        </div>
      </main>
    )
  }

  const identity = model.fields.filter((field) => field.material)
  const context = model.fields.filter((field) => !field.material)
  const markdown = compareMarkdown(model)
  const json = compareJson(model)

  return (
    <main className="shell pb-24">
      {/* The verdict panel stays neutral ink; a single amber eyebrow states
          the not-comparable verdict — the one place amber belongs here. */}
      <section className="mt-6 border border-border-strong bg-surface px-4 py-3 text-body text-muted">
        {!model.comparable && (
          <span className="mr-2.5 text-label text-warning uppercase">
            Not comparable
          </span>
        )}
        {model.explanation}
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
              {/* A differing field is the finding, not a hazard: brightness
                  and the ≠ glyph carry it (§16.16). */}
              <div
                className={`py-2.5 pr-3 text-small ${
                  field.differs ? "font-medium text-fg" : "text-subtle"
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

          {/* Context is immaterial to the verdict, so it opens on demand;
              the summary states how much is folded and whether any of it
              differs. Material mismatches above are never collapsed. */}
          <details className="group">
            <summary className="cursor-pointer list-none border-b border-line pt-4 pb-2.5 text-label text-faint uppercase transition-colors hover:text-subtle [&::-webkit-details-marker]:hidden">
              Context · {context.length} fields
              {context.some((field) => field.differs) &&
                ` · ${context.filter((field) => field.differs).length} differ`}
              <span className="ml-1.5 group-open:hidden">›</span>
              <span className="ml-1.5 hidden group-open:inline">⌄</span>
            </summary>
            {context.map((field) => (
              <div
                key={field.field}
                className="grid items-baseline border-b border-line transition-colors hover:bg-raised"
                style={columns(model.runs.length)}
              >
                <div className="py-2.5 pr-3 text-small text-subtle">
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
          </details>
        </div>
      </div>

      {/* One quiet utility line (§16 3-second rule): the sentence, then the
          add-run field and the three exports each behind a disclosure. */}
      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3 border-t border-border pt-5">
        <p className="max-w-[60ch] text-small text-subtle">
          {model.comparable
            ? "Ranks compare only these runs. Too close to call shares a rank."
            : "No winner: these runs didn't measure the same thing. The rows above show what differs."}{" "}
          <Link href="/docs#comparability">Why comparable?</Link>
        </p>
        <span className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-small">
          {model.runs.length < 8 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-faint transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
                Add run ›
              </summary>
              <div className="mt-2">
                <AddRun runs={model.runs.map((run) => run.runId)} />
              </div>
            </details>
          )}
          <details className="group">
            <summary className="cursor-pointer list-none text-faint transition-colors hover:text-fg [&::-webkit-details-marker]:hidden">
              Export ›
            </summary>
            <div className="mt-2 flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-subtle">
                Markdown <CopyButton text={markdown} />
              </span>
              <span className="flex items-center gap-1.5 text-subtle">
                CSV <CopyButton text={compareCsv(model)} />
              </span>
              <span className="flex items-center gap-1.5 text-subtle">
                JSON <CopyButton text={json} />
              </span>
            </div>
          </details>
        </span>
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
