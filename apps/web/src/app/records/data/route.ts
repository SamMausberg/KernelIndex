// The full records model as a CDN-cached JSON route: the ledger island
// fetches it once per session and every later interaction is client-side.
import { getRecordsPage } from "@/lib/catalog"

export async function GET() {
  return Response.json(await getRecordsPage(), {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  })
}
