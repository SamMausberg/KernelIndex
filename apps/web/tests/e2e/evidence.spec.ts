// Difficult evidence states stay visible without erasing history (§16.10):
// retraction banners, superseded links, and ineligibility reasons.
import { expect, test } from "@playwright/test"

test("a retracted run keeps its evidence with a visible retraction", async ({
  page,
}) => {
  await page.goto("/runs/run-fx-0010")
  await expect(
    page.getByText(/Retracted 2026-07-02/, { exact: false }).first(),
  ).toBeVisible()
  await expect(
    page.getByText("Not eligible to rank: RETRACTED", { exact: false }),
  ).toBeVisible()
})

test("a ranked run links its cohort and a comparison with #1", async ({
  page,
}) => {
  await page.goto("/runs/run-fx-0002")
  await expect(
    page.getByRole("link", { name: "Rank 2 in its comparison group" }),
  ).toHaveAttribute(
    "href",
    /\/operations\/rmsnorm-h4096\?workload=wl-2048&cohort=/,
  )
  await expect(
    page.getByRole("link", { name: "Compare with #1 →" }),
  ).toHaveAttribute("href", "/compare?run=run-fx-0001&run=run-fx-0002")
})

test("a superseded run stays auditable but ineligible", async ({ page }) => {
  await page.goto("/runs/run-fx-0008")
  await expect(
    page.getByText("Superseded by a corrected run", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText("Not eligible to rank: SUPERSEDED", { exact: false }),
  ).toBeVisible()
})

test("a run dossier serves its own Open Graph card", async ({ request }) => {
  const response = await request.get("/runs/run-fx-0002/opengraph-image")
  expect(response.ok()).toBe(true)
  expect(response.headers()["content-type"]).toContain("image/png")
})
