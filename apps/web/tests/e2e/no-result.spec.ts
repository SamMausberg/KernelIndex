// No-result guidance and parser error surfacing (§22.4 gate): unknown
// filters correct, unmatched queries guide, and nothing silently degrades.
import { expect, test } from "@playwright/test"

test("an unmatched query returns guidance with suggestions", async ({
  page,
}) => {
  await page.goto("/search?q=zzznotanoperation")
  await expect(
    page.getByText("No comparable public evidence found", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "rmsnorm bf16 pytorch" }),
  ).toBeVisible()
})

test("an unknown filter produces a correction hint beside the token", async ({
  page,
}) => {
  await page.goto("/search?q=rmsnorm%20gpuu:B200")
  await expect(
    page.getByText("did you mean 'gpu:'", { exact: false }),
  ).toBeVisible()
  // The rest of the query still resolves; the operation is not lost.
  await expect(
    page.getByRole("heading", { name: "RMSNorm, hidden 4096" }),
  ).toBeVisible()
})
