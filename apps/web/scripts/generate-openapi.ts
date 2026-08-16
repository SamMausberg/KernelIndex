// Emit the OpenAPI document from the runtime route schemas (§13.9):
// runtime Zod → OpenAPI JSON in packages/sdk → generated TypeScript client
// (`pnpm openapi:generate` at the root runs both steps). The info block is
// the same object the runtime /openapi.json route serves.
import { writeFileSync } from "node:fs"
import path from "node:path"
import { api, OPENAPI_INFO } from "../src/server/api/app.ts"

const document = api.getOpenAPI31Document(OPENAPI_INFO)
const out = path.resolve(
  import.meta.dirname,
  "../../../packages/sdk/openapi.json",
)
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(`wrote ${out} (${Object.keys(document.paths ?? {}).length} paths)`)
