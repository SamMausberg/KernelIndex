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

test("a superseded run stays auditable but ineligible", async ({ page }) => {
  await page.goto("/runs/run-fx-0008")
  await expect(
    page.getByText("Superseded by a corrected run", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByText("Not eligible to rank: SUPERSEDED", { exact: false }),
  ).toBeVisible()
})
