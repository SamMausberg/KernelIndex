// Records ledger island: the page is ISR (default slice from cache);
// filters, sorts, views, and deep links are client transitions backed by
// the /records/data fetch, with the URL kept shareable.
import { expect, test } from "@playwright/test"

test("ledger interactions update rows and URL without navigation", async ({
  page,
}) => {
  await page.goto("/records")
  await expect(page.getByText("Current record", { exact: true })).toBeVisible()

  // The model loads lazily on interaction intent; hovering the ledger is
  // that intent. Wait for the fetch so interactions go client-side.
  const modelLoaded = page.waitForResponse((response) =>
    response.url().includes("/records/data"),
  )
  await page.getByText("Current record", { exact: true }).hover()
  await modelLoaded
  await page.getByRole("link", { name: "Largest improvement" }).click()
  await expect(page).toHaveURL(/sort=improvement/)

  await page.getByRole("link", { name: "Recently broken" }).click()
  await expect(page).toHaveURL(/view=broken/)
  await expect(
    page.getByText("broken in the last 30 days").first(),
  ).toBeVisible()
})

test("a deep-linked ledger view applies after hydration", async ({ page }) => {
  await page.goto("/records?view=history")
  await expect(page.getByText("record event", { exact: false })).toBeVisible()
})
