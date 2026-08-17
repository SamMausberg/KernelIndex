// The Phase-2 browse surfaces (GPU pages, projects index, sweep chart)
// against the fixtures backend: each renders its facts and cross-links
// into the existing catalog pages.
import { expect, test } from "@playwright/test"

test("GPU index lists the fixture GPU and reaches its dossier", async ({
  page,
}) => {
  await page.goto("/gpus")
  const row = page.getByRole("link", { name: "NVIDIA B200 SXM" })
  await expect(row).toBeVisible()
  await row.click()
  await expect(
    page.getByRole("heading", { name: "NVIDIA B200 SXM" }),
  ).toBeVisible()
  await expect(page.getByText("Records held on this GPU")).toBeVisible()
  // The ledger deep link carries the hardware filter.
  await expect(
    page.getByRole("link", { name: "Open in the records ledger →" }),
  ).toHaveAttribute("href", /hw=NVIDIA/)
})

test("projects index states standing without cross-cohort ranking", async ({
  page,
}) => {
  await page.goto("/implementations")
  await expect(page.getByText("Meridian Kernels (fictional)")).toBeVisible()
  await expect(
    page.getByText("Ordered by corpus presence, not merit", { exact: false }),
  ).toBeVisible()
})

test("operation page renders the scaling sweep with direct labels", async ({
  page,
}) => {
  await page.goto("/operations/rmsnorm-h4096")
  await expect(
    page.getByRole("heading", { name: "Scaling by tokens" }),
  ).toBeVisible()
  const chart = page.locator(".sweep svg")
  await expect(chart).toBeVisible()
  // Both implementations with multi-point traces appear as series labels.
  await expect(chart.getByText("meridian-rmsnorm")).toBeVisible()
  await expect(chart.getByText("ionflux-rmsnorm")).toBeVisible()
  await expect(page.getByText("held constant", { exact: false })).toBeVisible()
})
