// Mirrored kernel source display (§16.9): server-rendered shiki HTML and a
// precomputed line diff — no client JS, no repaint work. The attribution
// line under the code is a display condition of the upstream license.
import Link from "next/link"
import type { ImplementationPageModel } from "@/lib/catalog"
import { highlightSource } from "@/server/highlight"

type SourceCode = NonNullable<ImplementationPageModel["sourceCode"]>

export async function SourceCodeView({ code }: { code: SourceCode }) {
  const html = await highlightSource(code.content, code.language)
  const lineCount = code.content.split("\n").length
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between gap-4 text-[12px] text-faint">
        <span className="font-mono">{code.fileName ?? "source"}</span>
        <span>{lineCount} lines</span>
      </div>
      <div
        className="plate source-view max-h-[600px] overflow-auto"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output from our own server-side highlighter
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <p className="mt-2 text-[12px] text-faint">
        Source code from{" "}
        {code.attribution?.url ? (
          <a href={code.attribution.url}>{code.attribution.text}</a>
        ) : (
          (code.attribution?.text ?? "the importing source")
        )}
        {code.license && ` · ${code.license}`}
      </p>
    </>
  )
}

export function SourceDiffView({ diff }: { diff: SourceCode["diff"] }) {
  if (!diff) return null
  return (
    <>
      <p className="mb-2 text-[12.5px] text-subtle">
        Against this author&apos;s previous submission{" "}
        <Link href={`/implementations/${diff.previousSlug}`}>
          {diff.previousName}
        </Link>
        .
      </p>
      <pre className="plate max-h-[480px] overflow-auto px-4 py-3 font-mono text-[12.5px] leading-relaxed">
        {diff.lines.map((line, index) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static server-rendered diff lines
            key={index}
            className={
              line.kind === "add"
                ? "text-success"
                : line.kind === "del"
                  ? "text-warning"
                  : "text-faint"
            }
          >
            {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}
            {line.text || " "}
          </div>
        ))}
      </pre>
    </>
  )
}
