// Homepage search → exact result → evidence dossier (§21.4). Asserts the
// semantic invariants of the journey, not pixel details: interpreted facets,
// group separation, ranked answer, and the run page as citation.
import { expect, test } from "@playwright/test"

test("homepage search reaches an exact ranked answer with evidence", async ({
  page,
}) => {
  await page.goto("/")
  const input = page.locator('input[name="q"]').first()
  await input.fill("rmsnorm B200 bf16")
  await input.press("Enter")

  await expect(page).toHaveURL(/\/search\?q=rmsnorm(\+|%20)B200(\+|%20)bf16/)
  await expect(
    page.getByRole("heading", { name: "RMSNorm, hidden 4096" }),
  ).toBeVisible()

  // Recognized facets render as editable tokens (§16.6).
  await expect(page.getByText("gpu B200")).toBeVisible()
  await expect(page.getByText("dtype bf16")).toBeVisible()

  // The headline answer states its evidence level, never a bare superlative.
  await expect(page.getByText("Fastest verified").first()).toBeVisible()

  // Expanding a row explains its rank inside the cohort in one line.
  await page
    .locator("details")
    .filter({ hasText: "Same workload, protocol, environment" })
    .first()
    .locator("summary")
    .click()
  await expect(
    page.getByText("Same workload, protocol, environment").first(),
  ).toBeVisible()

  // Row → run dossier: the permanent evidence citation.
  await page.getByRole("link", { name: "Run dossier →" }).first().click()
  await expect(page).toHaveURL(/\/runs\/run-fx-/)
  await expect(page.getByText("Correctness").first()).toBeVisible()
})

test("facet tokens are removable through the URL", async ({ page }) => {
  await page.goto("/search?q=rmsnorm%20B200%20bf16")
  await page.getByRole("link", { name: "Remove gpu B200" }).click()
  await expect(page).toHaveURL(/q=rmsnorm(\+|%20)bf16/)
  await expect(page.getByText("gpu B200")).toHaveCount(0)
})

test("reported evidence stays separated from the exact cohort", async ({
  page,
}) => {
  await page.goto("/search?q=rmsnorm")
  await page.getByRole("link", { name: /^Reported/ }).click()
  await expect(
    page.getByText("Preserved as published under the source protocol", {
      exact: false,
    }),
  ).toBeVisible()
})
