// WCAG 2.2 AA budget (§16.17, §21.4): zero serious/critical axe violations
// on the critical pages, plus the keyboard entry flow. Automated checks
// supplement — never replace — the manual zoom/screen-reader review listed
// in docs/hardening.md.
import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"

const CRITICAL_PAGES = [
  "/",
  "/search?q=rmsnorm%20B200%20bf16",
  "/search?q=zzznotanoperation",
  "/records",
  "/compare?run=run-fx-0002&run=run-fx-0003",
  "/implementations",
  "/implementations/ionflux-rmsnorm",
  "/operations/rmsnorm-h4096",
  "/runs/run-fx-0001",
  "/gpus",
  "/gpus/nvidia-b200-sxm",
  "/serving",
  "/serving-runs/srv-fx-0002",
  "/docs",
  "/docs/api",
  "/coverage",
  "/signin",
]

for (const path of CRITICAL_PAGES) {
  test(`axe: no serious or critical violations on ${path}`, async ({
    page,
  }) => {
    await page.goto(path)
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      // Documented exceptions (docs/hardening.md): dense evidence rows are
      // progressive-enhancement <details> whose summaries contain links
      // (no-JS expansion beats the nested-interactive heuristic here), and
      // §16.17 scopes touch targets to "44px where practical" — covered by
      // the manual checklist, not this budget.
      .disableRules(["nested-interactive", "target-size"])
      .analyze()
    const blocking = results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical",
    )
    for (const violation of results.violations) {
      if (!blocking.includes(violation))
        console.log(`minor a11y (${path}): ${violation.id}`)
    }
    expect(
      blocking.map((violation) => `${violation.id}: ${violation.help}`),
    ).toEqual([])
  })
}

test("keyboard: skip link reaches main content from the top of the page", async ({
  page,
}) => {
  await page.goto("/")
  await page.keyboard.press("Tab")
  await expect(
    page.getByRole("link", { name: "Skip to content" }),
  ).toBeFocused()
})
