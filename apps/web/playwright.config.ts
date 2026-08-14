// Critical public journeys (§21.4) against the fixture backend: the fixtures
// deterministically cover exact, tied, disputed, retracted, superseded, and
// no-result states. Requires a production build first: pnpm build.
import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  timeout: 20_000,
  use: { baseURL: "http://127.0.0.1:3105" },
  webServer: {
    command: "pnpm start -- -p 3105",
    url: "http://127.0.0.1:3105",
    env: { CATALOG_BACKEND: "fixtures" },
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
