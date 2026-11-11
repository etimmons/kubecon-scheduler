import { expect, test } from "@playwright/test";

const MIDDAY = "now=2026-11-10T14:10:00-07:00";

test("Schedule opens at the current time when past sessions are shown, and remembers a recent position", async ({ page }) => {
  await page.goto(`/?past=show&${MIDDAY}`);
  await page.waitForSelector(".row");
  const anchor = page.locator("[data-now]");
  await expect(anchor).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
  const top = await anchor.evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(top - 64)).toBeLessThan(4);

  // Scroll to the top, switch tabs and back: the recent position wins over "now".
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(100);
  await page.getByRole("button", { name: /^Now/ }).click();
  await page.getByRole("button", { name: /^Schedule/ }).click();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.getByRole("button", { name: "Jump to now" }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
});

test("My Schedule opens at the current time", async ({ page }) => {
  await page.goto(`/?past=show&date=tue-nov-10&${MIDDAY}`);
  await page.waitForSelector(".row");
  const rows = page.locator(".row");
  const n = await rows.count();
  for (const i of [0, 1, 2, n - 3, n - 2, n - 1]) await rows.nth(i).locator(".star").click();
  await page.getByRole("button", { name: /^My Schedule/ }).click();
  await expect(page.locator("[data-now]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Jump to now" })).toBeVisible();
});

test("Now tab can show only starred sessions, and remembers the choice", async ({ page }) => {
  await page.goto(`/?tab=now&${MIDDAY}`);
  await page.waitForSelector(".row");
  const all = await page.locator(".row").count();
  expect(all).toBeGreaterThan(2);
  const title = (await page.locator(".row").nth(1).locator(".row-title").textContent())!;
  await page.locator(".row").nth(1).locator(".star").click();

  await page.getByRole("button", { name: "★ Starred" }).click();
  await expect(page.locator(".row")).toHaveCount(1);
  await expect(page.locator(".row-title")).toHaveText(title);

  await page.reload();
  await expect(page.getByRole("button", { name: "★ Starred" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".row")).toHaveCount(1);

  // Unstar: empty state offers to go back to everything.
  await page.locator(".row .star").click();
  await expect(page.getByText("None of your starred sessions are on right now.")).toBeVisible();
  await page.getByRole("button", { name: /^Show all \d+/ }).click();
  await expect(page.locator(".row")).toHaveCount(all);
});
