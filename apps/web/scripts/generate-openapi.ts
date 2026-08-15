// Emit the OpenAPI document from the runtime route schemas (§13.9):
// runtime Zod → OpenAPI JSON → generated TypeScript client in apps/cli.
import { writeFileSync } from "node:fs"
import path from "node:path"
import { api } from "../src/server/api/app.ts"

const document = api.getOpenAPI31Document({
  openapi: "3.1.0",
  info: { title: "KernelIndex API", version: "v1" },
})
const out = path.resolve(import.meta.dirname, "../../cli/openapi.json")
writeFileSync(out, `${JSON.stringify(document, null, 2)}\n`)
console.log(`wrote ${out} (${Object.keys(document.paths ?? {}).length} paths)`)
