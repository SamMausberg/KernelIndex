// The ledger model as a CDN-cached JSON route: the island fetches it once
// per session and every later interaction is client-side. Ships the slim
// projection (LedgerModel), not the full catalog model — holder rows carry
// only the fields the record surfaces render.
import { slimModel } from "@/features/records/ledger-model"
import { getRecordsPage } from "@/lib/catalog"

export async function GET() {
  return Response.json(slimModel(await getRecordsPage()), {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  })
}
