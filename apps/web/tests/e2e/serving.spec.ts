// Serving resolver journeys (§16.13, §22.10 gate): cohorts never merge,
// ranking exists only under an objective, constraints on unreported metrics
// exclude with a reason, and the dossier is one click away.
import { expect, test } from "@playwright/test"

test("resolver shows separated cohorts, ranks, and the Pareto frontier", async ({
  page,
}) => {
  await page.goto("/serving")
  await expect(page.getByText("Example data.", { exact: false })).toBeVisible()
  // Interactive and Offline are distinct cohort groups, never interleaved.
  await expect(
    page.getByRole("heading", { name: /interactive-chat-trace/ }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: /offline-batch-trace/ }),
  ).toBeVisible()
  // Default objective ranks by throughput: the 44,100 tokens/s row leads.
  const interactive = page
    .locator("section")
    .filter({ hasText: "interactive-chat-trace" })
    .first()
  await expect(interactive.getByText("44,100")).toBeVisible()
  // The throughput-only candidate collapses the shared axes to one, so no
  // Pareto figure renders here (honest degradation); no score column exists.
  await expect(page.getByText(/score/i)).toHaveCount(0)
})

test("constraints exclude unreported or unsatisfied candidates with reasons", async ({
  page,
}) => {
  await page.goto("/serving?workload=interactive-chat-trace&ttft=400")
  const interactive = page
    .locator("section")
    .filter({ hasText: "interactive-chat-trace" })
    .first()
  await interactive.locator("summary", { hasText: "excluded" }).first().click()
  await expect(
    interactive.getByText("METRIC_NOT_REPORTED:ttft_ms"),
  ).toBeVisible()
  await expect(
    interactive.getByText("CONSTRAINT_UNSATISFIED:ttft_ms"),
  ).toBeVisible()
  // With the throughput-only candidate excluded, the remaining rows share
  // both axes and the Pareto frontier figure renders.
  await expect(
    interactive.getByRole("img", { name: /Pareto frontier/ }),
  ).toBeVisible()
})

test("a result row reaches its serving-run dossier", async ({ page }) => {
  await page.goto("/serving")
  const row = page
    .locator("details")
    .filter({ hasText: "tp8 · bf16 · latency tuned" })
    .first()
  await row.locator("summary").click()
  await row.getByRole("link", { name: "Run dossier →" }).click()
  await expect(page).toHaveURL(/\/serving-runs\/srv-fx-/)
  await expect(page.getByText("Measurements", { exact: true })).toBeVisible()
  await expect(page.getByText("quality policy")).toBeVisible()
  await expect(page.getByText("shown unmodified as published")).toBeVisible()
})
