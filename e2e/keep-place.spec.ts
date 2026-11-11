import { expect, test } from "@playwright/test";

const NOW = "now=2026-11-10T09:00:00-07:00";
const FILTERS = "all-sessions=security|platform-engineering|observability&past=show";

test("detail keeps the list's place: scroll, open, back, same scroll and filters", async ({ page }) => {
  await page.goto(`/?${FILTERS}&${NOW}`);
  await page.waitForSelector(".row");
  const listUrl = page.url();
  const count = await page.locator(".row").count();
  expect(count).toBeGreaterThan(20);

  await page.mouse.wheel(0, 2500);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1500);
  const y = await page.evaluate(() => window.scrollY);

  // Open a row that is on screen.
  const target = page.locator(".row-main").nth(await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".row-main")];
    return rows.findIndex((r) => r.getBoundingClientRect().top > 150);
  }));
  const title = (await target.locator(".row-title").textContent())!;
  await target.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".detail h1")).toHaveText(title);
  expect(page.url()).toContain("id=");

  // Step to the next session within the filtered list, without closing.
  await page.getByRole("button", { name: "Next session" }).click();
  await expect(page.locator(".detail h1")).not.toHaveText(title);

  // Browser back closes the sheet and returns to the exact same list.
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).toBe(listUrl);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  await expect(page.locator(".row")).toHaveCount(count);

  // Same again with the close button.
  await target.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).toBe(listUrl);
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
});

test("filters edited in the sheet survive closing it, and reload restores the view", async ({ page }) => {
  await page.goto(`/?${NOW}`);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("checkbox", { name: /^Advanced/ }).click();
  const show = page.getByRole("button", { name: /^Show \d+ sessions?$/ });
  const n = Number((await show.textContent())!.match(/\d+/)![0]);
  await show.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(page.url()).toContain("audience-level=advanced");
  await expect(page.locator(".row")).toHaveCount(n);
  await page.reload();
  await expect(page.locator(".row")).toHaveCount(n);
});

test("stars persist across reloads and show in My Schedule", async ({ page }) => {
  await page.goto(`/?${NOW}`);
  const first = page.locator(".row").first();
  const title = (await first.locator(".row-title").textContent())!;
  await first.locator(".star").click();
  await page.reload();
  await expect(page.locator(".row").first().locator(".star")).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^My Schedule/ }).click();
  await expect(page.locator(".row-title").first()).toHaveText(title);
});

test("My Schedule filters by day", async ({ page }) => {
  await page.goto(`/?${NOW}&date=tue-nov-10`);
  await page.locator(".row").nth(0).locator(".star").click();
  await page.locator(".row").nth(1).locator(".star").click();
  await page.getByRole("button", { name: /^Wed/ }).click();
  await page.locator(".row").nth(0).locator(".star").click();

  await page.getByRole("button", { name: /^My Schedule/ }).click();
  const days = page.getByRole("navigation", { name: "Day" });
  await expect(days.getByRole("button")).toHaveText(["All3", /^TueNov 10 · 2$/, /^WedNov 11 · 1$/]);
  // Opens on today's tab by default (the clock says Tue).
  await expect(days.getByRole("button", { name: /^Tue/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".row")).toHaveCount(2);
  await expect(page.locator(".day-head")).toHaveText([/^Tue Nov 10/]);

  await days.getByRole("button", { name: /^All/ }).click();
  expect(page.url()).toContain("day=all");
  await expect(page.locator(".row")).toHaveCount(3);

  await days.getByRole("button", { name: /^Tue/ }).click();
  expect(page.url()).toContain("day=tue-nov-10");
  await expect(page.locator(".row")).toHaveCount(2);

  // Survives a reload, and doesn't touch the Schedule tab's own date filter.
  await page.reload();
  await expect(page.locator(".row")).toHaveCount(2);
  await days.getByRole("button", { name: /^Wed/ }).click();
  await expect(page.locator(".row")).toHaveCount(1);
  await page.getByRole("button", { name: /^Schedule/ }).click();
  await expect(page.getByRole("navigation", { name: "Day" }).getByRole("button", { name: /^Wed/ })).toHaveClass(/on/);

  await page.getByRole("button", { name: /^My Schedule/ }).click();
  await days.getByRole("button", { name: /^All/ }).click();
  await expect(page.locator(".row")).toHaveCount(3);
});

test("My Schedule falls back to All when today has nothing starred", async ({ page }) => {
  await page.goto(`/?${NOW}&date=wed-nov-11`);
  await page.waitForSelector(".row");
  await page.locator(".row").nth(0).locator(".star").click();
  await page.getByRole("button", { name: /^My Schedule/ }).click();
  await expect(page.getByRole("navigation", { name: "Day" }).getByRole("button", { name: /^All/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".row")).toHaveCount(1);
});
