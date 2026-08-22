// Challenges (§2.3): the board renders its kinds from fixtures, and the
// no-answer search state records demand without an account.
import { expect, test } from "@playwright/test"

test("the challenges board states what is missing, with actions", async ({
  page,
}) => {
  await page.goto("/challenges")
  await expect(
    page.getByRole("heading", { name: "Requested workloads" }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Priority gaps" }),
  ).toBeVisible()
  await expect(page.getByText("7×", { exact: true })).toBeVisible()
})

test("a no-answer search offers to record the workload request", async ({
  page,
}) => {
  await page.goto("/search?q=rmsnorm%20B200%20bf16%20tokens%3D3000")
  await page.getByRole("button", { name: "Ask for this workload" }).click()
  await expect(
    page.getByText("Recorded. Requests rank the challenges board."),
  ).toBeVisible()
})
