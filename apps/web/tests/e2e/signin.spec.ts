// Sign-in surface (§13.6): the nav reaches /signin, and an unconfigured
// deployment (the e2e fixture server) states that honestly instead of
// rendering a dead button.
import { expect, test } from "@playwright/test"

test("nav reaches the sign-in page; unconfigured auth is stated", async ({
  page,
}) => {
  await page.goto("/")
  await page.getByRole("link", { name: "Sign in" }).click()
  await expect(page).toHaveURL(/\/signin$/)
  await expect(
    page.getByText("Sign-in is not configured on this deployment"),
  ).toBeVisible()
  await expect(page.getByText("What an account unlocks")).toBeVisible()
  // No GitHub button renders without credentials.
  await expect(
    page.getByRole("button", { name: "Continue with GitHub" }),
  ).toHaveCount(0)
})

test("signed-out watch offers a sign-in link that returns to the page", async ({
  page,
}) => {
  await page.goto("/operations/rmsnorm-h4096")
  await page.getByRole("button", { name: "Watch cohort" }).click()
  const link = page.getByRole("link", { name: "Sign in to watch records" })
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute(
    "href",
    "/signin?next=%2Foperations%2Frmsnorm-h4096",
  )
})
