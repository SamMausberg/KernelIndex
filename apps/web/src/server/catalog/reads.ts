// PostgreSQL-backed implementations of the catalog read seam (§27.5).
// Implemented in Week 2 behind the same models the fixtures use.
import type {
  ImplementationPageModel,
  OperationPageModel,
  RunPageModel,
  SearchInput,
  SearchPageModel,
} from "@/lib/catalog-models"

function unavailable(): never {
  throw new Error(
    "CATALOG_BACKEND=postgres is selected but the PostgreSQL catalog reads are not implemented yet",
  )
}

export async function searchCatalog(
  _input: SearchInput,
): Promise<SearchPageModel> {
  unavailable()
}

export async function getOperationPage(
  _slug: string,
  _options?: { workload?: string },
): Promise<OperationPageModel | null> {
  unavailable()
}

export async function getImplementationPage(
  _slug: string,
): Promise<ImplementationPageModel | null> {
  unavailable()
}

export async function getRunPage(_id: string): Promise<RunPageModel | null> {
  unavailable()
}
