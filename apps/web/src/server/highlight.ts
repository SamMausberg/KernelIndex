// Server-side syntax highlighting for mirrored kernel source (§16.9): a
// lazily created shiki core with only the grammars the corpus contains and
// the JavaScript regex engine (no wasm). Pages are ISR-cached, so the cost
// is per revalidation, and no highlighting JS ever ships to the client.
import { createHighlighterCore, type HighlighterCore } from "shiki/core"
import { createJavaScriptRegexEngine } from "shiki/engine/javascript"
import cpp from "shiki/langs/cpp.mjs"
import python from "shiki/langs/python.mjs"
import githubDarkDefault from "shiki/themes/github-dark-default.mjs"

let corePromise: Promise<HighlighterCore> | null = null

function highlighter(): Promise<HighlighterCore> {
  corePromise ??= createHighlighterCore({
    themes: [githubDarkDefault],
    langs: [python, cpp],
    engine: createJavaScriptRegexEngine(),
  })
  return corePromise
}

/** Highlighted `<pre>` HTML; the theme background yields to the site plate. */
export async function highlightSource(
  code: string,
  language: "python" | "cpp" | "text",
): Promise<string> {
  const core = await highlighter()
  return core.codeToHtml(code, {
    lang: language,
    theme: "github-dark-default",
    colorReplacements: { "#0d1117": "transparent" },
  })
}
