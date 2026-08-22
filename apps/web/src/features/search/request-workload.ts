"use server"

// "Ask for this workload" (§2.3, §20.5): records coarse facets only —
// operation slug, GPU, dtype, and axis bindings bucketed to the nearest
// power of two — never query text. Anonymous is allowed; the counter is
// pruned with the other product events after 90 days.
import { parseQuery } from "@/lib/search-query"
import { recordEvent } from "@/server/events"

export type RequestState = { message: string; recorded?: boolean }

/** Nearest power of two, so a proprietary exact size never leaves the
 * reader's machine. */
const bucket = (value: number) => 2 ** Math.round(Math.log2(Math.max(1, value)))

export async function requestWorkloadAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const operation = String(formData.get("operation") ?? "").slice(0, 200)
  if (operation === "") return { message: "" }
  const intent = parseQuery(String(formData.get("q") ?? "").slice(0, 500))
  const axes = Object.fromEntries(
    Object.entries(intent.axes)
      .slice(0, 4)
      .map(([axis, value]) => [axis, bucket(value)]),
  )
  if (intent.shape !== null)
    axes.shape = bucket(intent.shape.reduce((a, b) => a * b, 1))
  await recordEvent("workload_requested", {
    operation,
    ...(intent.gpu ? { gpu: intent.gpu } : {}),
    ...(intent.dtypes[0] ? { dtype: intent.dtypes[0] } : {}),
    ...(Object.keys(axes).length > 0 ? { axes } : {}),
  })
  return {
    message: "Recorded. Requests rank the challenges board.",
    recorded: true,
  }
}
