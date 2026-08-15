// The corpus suggest index as a CDN-cached JSON route (§16.5): one small
// payload per session instead of inlining the index into every page.
import { getOperationIndex } from "@/lib/catalog"

export async function GET() {
  const index = await getOperationIndex()
  return Response.json(index, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  })
}
