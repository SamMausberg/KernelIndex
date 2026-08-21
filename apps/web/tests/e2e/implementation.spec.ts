// Implementation dossier: mirrored kernel source renders highlighted with
// its attribution line, and the submission diff names its predecessor.
import { expect, test } from "@playwright/test"

test("implementation page renders kernel source, diff, and attribution", async ({
  page,
}) => {
  await page.goto("/implementations/ionflux-rmsnorm")
  await expect(
    page.getByRole("heading", { name: "Kernel source" }),
  ).toBeVisible()
  await expect(page.getByText("submission.py").first()).toBeVisible()
  await expect(page.getByText("custom_kernel").first()).toBeVisible()
  await expect(
    page.getByText("Source code from", { exact: false }),
  ).toBeVisible()
  await expect(
    page.getByRole("heading", { name: "Changes from previous submission" }),
  ).toBeVisible()
  await expect(page.getByText("# fused path")).toBeVisible()
})
