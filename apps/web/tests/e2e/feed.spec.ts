// The feed (§13.11): the public view renders from fixtures; the Following
// view asks a signed-out reader to sign in instead of showing anything.
import { expect, test } from "@playwright/test"

test("the public feed states what the index learned, by day", async ({
  page,
}) => {
  await page.goto("/feed")
  await expect(page.getByRole("heading", { name: "Feed" })).toBeVisible()
  await expect(page.getByText("took the record for").first()).toBeVisible()
  await expect(page.getByText("import ·", { exact: false })).toBeVisible()
})

test("a deep-linked following view asks a signed-out reader to sign in", async ({
  page,
}) => {
  await page.goto("/feed?following=1")
  await expect(
    page.getByRole("link", { name: /Sign in to follow/ }),
  ).toBeVisible()
})
