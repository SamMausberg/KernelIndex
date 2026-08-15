// Compare page (§16.11): winners only inside one cohort; incomparable
// selections name the first material mismatch instead of a false winner.
import { expect, test } from "@playwright/test"

test("comparable runs in one cohort receive ranks under ranking-v1", async ({
  page,
}) => {
  await page.goto("/compare?run=run-fx-0002&run=run-fx-0003")
  await expect(
    page.getByText("ranks follow ranking-v1", { exact: false }),
  ).toBeVisible()
  // These two fixture runs tie: overlapping confidence intervals share rank 1.
  await expect(page.getByText("#1", { exact: true })).toBeVisible()
  await expect(page.getByText("#1=", { exact: true })).toBeVisible()
})

test("an incomparable selection never receives a winner", async ({ page }) => {
  await page.goto("/compare?run=run-fx-0001&run=run-fx-0005")
  await expect(
    page.getByText("No winner can be declared: workload differs", {
      exact: false,
    }),
  ).toBeVisible()
  await expect(page.getByText("no ranks: not comparable")).toBeVisible()
  // The aligned diff marks the differing identity field.
  await expect(page.getByText("workload ≠")).toBeVisible()
})

test("the empty compare state explains how to select runs", async ({
  page,
}) => {
  await page.goto("/compare")
  await expect(
    page.getByText("Select two to eight runs to compare", { exact: false }),
  ).toBeVisible()
})
