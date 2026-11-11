import { expect, test } from "@playwright/test";

// Runs against the production build served by the real server (service worker enabled):
//   npm run build && AUTH=header DEV_USER=dev SEED_SCHEDULE=dist/app/schedule.json SCRAPE=off npm start
//   PROD_URL=http://localhost:8080 npx playwright test e2e/offline.spec.ts
const PROD = process.env.PROD_URL;
test.skip(!PROD, "set PROD_URL to run against the production server");

test("after one online load, offline still shows schedule, filters, search and stars", async ({ page, context }) => {
  await page.goto(`${PROD}/?now=2026-11-10T09:00:00-07:00`);
  await page.waitForSelector(".row");
  await page.evaluate(() => navigator.serviceWorker.ready);
  // Wait until the service worker controls the page (first load installs it).
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  const first = page.locator(".row").first();
  const title = (await first.locator(".row-title").textContent())!;
  await first.locator(".star").click();

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector(".row");
  await expect(page.locator(".row").first().locator(".row-title")).toHaveText(title);
  await expect(page.locator(".row").first().locator(".star")).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("searchbox").fill("kubernetes");
  expect(await page.locator(".row").count()).toBeGreaterThan(5);
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("checkbox", { name: /^Security/ }).first().click();
  await page.getByRole("button", { name: /^Show \d+ sessions?$/ }).click();
  expect(page.url()).toContain("all-sessions=security");
  await page.getByRole("button", { name: /^My Schedule/ }).click();
  await expect(page.locator(".row-title").first()).toHaveText(title);

  // Sync reports offline rather than failing.
  await page.getByRole("button", { name: "Sync and settings" }).click();
  await expect(page.getByText(/Offline/)).toBeVisible();
  await context.setOffline(false);
});

test("stars sync through the server", async ({ page }) => {
  await page.goto(`${PROD}/?now=2026-11-10T09:00:00-07:00`);
  await page.waitForSelector(".row");
  const id = await page.locator(".row").nth(1).getAttribute("data-id");
  await page.locator(".row").nth(1).locator(".star").click();
  await page.getByRole("button", { name: "Sync and settings" }).click();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/^Synced/)).toBeVisible();
  const server = await (await page.request.get(`${PROD}/api/stars?event=kccncna2026`)).json();
  expect(server.records.find((r: { id: string }) => r.id === id)?.starred).toBe(true);
});
