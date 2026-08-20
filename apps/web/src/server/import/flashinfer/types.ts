// FlashInfer-Bench (`flashinfer-ai/flashinfer-trace`, Apache-2.0 — see
// docs/source-policy.md): the upstream origin of the trace schema the SOL
// importer parses, so definitions and traces reuse those parsers; only the
// solution document differs (inline Apache-2.0 sources, singular language).
import { z } from "zod"

export const FLASHINFER_SOURCE = {
  slug: "flashinfer-bench",
  kind: "benchmark",
  name: "FlashInfer-Bench",
  policy: {
    license: "Apache-2.0",
    attribution: "FlashInfer-Bench (flashinfer-ai/flashinfer-trace)",
    url: "https://huggingface.co/datasets/flashinfer-ai/flashinfer-trace",
    terms:
      "Apache-2.0: redistribution and display permitted with license notice. Baseline (human/library) traces import by default; model-generated solutions and traces import only via explicit author selection and carry the llm-generated role with the generating model named.",
    verified: "2026-08-14",
    freshnessDays: 10,
  },
} as const

/** version 3: author-directory selection — model-authored (LLM) solutions
 * and traces import on explicit opt-in, labeled role llm-generated. v2
 * accepted upstream "Infinity" error bounds (recorded as no bound) and
 * reviewed unknown-definition solutions as ambiguities. */
export const PARSER = { name: "flashinfer-bench", version: "3" } as const

export const DATASET = "flashinfer-ai/flashinfer-trace"
export const DATASET_API = `https://huggingface.co/api/datasets/${DATASET}`
export const DATASET_URL = `https://huggingface.co/datasets/${DATASET}`
export const HARNESS_REPO = "https://github.com/flashinfer-ai/flashinfer-bench"

/** Dataset revision listing: the pinned sha plus the file tree. */
export const fiDatasetInfo = z.looseObject({
  sha: z.string().regex(/^[0-9a-f]{40}$/),
  siblings: z.array(z.looseObject({ rfilename: z.string() })),
})

/** FlashInfer solution document — inline sources, singular language. */
export const fiSolution = z.looseObject({
  name: z.string(),
  definition: z.string(),
  author: z.string().nullish(),
  description: z.string().nullish(),
  spec: z
    .looseObject({
      language: z.string().nullish(),
      target_hardware: z.array(z.string()).nullish(),
      entry_point: z.string().nullish(),
      dependencies: z.array(z.string()).nullish(),
    })
    .nullish(),
  sources: z
    .array(z.looseObject({ path: z.string(), content: z.string() }))
    .nullish(),
})

export type FiDatasetInfo = z.output<typeof fiDatasetInfo>
export type FiSolution = z.output<typeof fiSolution>
