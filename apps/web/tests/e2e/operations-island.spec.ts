// Operation records island: the page is ISR (default variant from cache);
// workload/cohort selection is a client transition backed by the
// /operations/[slug]/data fetch, with the URL kept shareable.
import { expect, test } from "@playwright/test"

test("workload selection swaps the records section without navigation", async ({
  page,
}) => {
  await page.goto("/operations/rmsnorm-h4096")
  // Default variant (wl-2048) renders server-side with its cohort panel.
  await expect(page.getByText("Exact comparison")).toBeVisible()

  const variantLoaded = page.waitForResponse((response) =>
    response.url().includes("/operations/rmsnorm-h4096/data"),
  )
  await page.getByRole("link", { name: /tokens = 1024/ }).click()
  await variantLoaded
  await expect(page).toHaveURL(/workload=wl-1024/)
  // The 1024-token workload has no cohort context in the fixtures; the
  // panel leaving proves the variant swapped in without a navigation.
  await expect(page.getByText("Exact comparison")).toBeHidden()
})

test("a deep-linked workload applies after hydration", async ({ page }) => {
  await page.goto("/operations/rmsnorm-h4096?workload=wl-1024")
  await expect(page.getByText("Exact comparison")).toBeHidden()
  await expect(
    page.getByRole("heading", { name: "Current records" }),
  ).toBeVisible()
})
