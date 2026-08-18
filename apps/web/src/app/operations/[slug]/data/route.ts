// Workload/cohort variants of the operation page as a CDN-cached JSON
// route: the ISR page renders the default variant, and the records island
// fetches the selected one here (records-data pattern, §16.12).
import { operationVariant } from "@/features/operations/variant"
import { getOperationPage } from "@/lib/catalog"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params
  const search = new URL(request.url).searchParams
  const model = await getOperationPage(
    slug,
    search.get("workload") ?? undefined,
    search.get("cohort") ?? undefined,
  )
  if (!model) return new Response(null, { status: 404 })
  return Response.json(operationVariant(model), {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400",
    },
  })
}
