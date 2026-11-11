import { expect, test } from "@playwright/test";

// Runs against the production build served by the real server in token mode:
//   npm run build && AUTH=token DATA_DIR=/tmp/ks SEED_SCHEDULE=dist/app/schedule.json SCRAPE=off PORT=8081 npm start
//   INVITE_TOKEN=$(DATA_DIR=/tmp/ks node server/src/admin.ts invite tester | sed -n 's/^Token for tester: //p')
//   TOKEN_URL=http://localhost:8081 INVITE_TOKEN=$INVITE_TOKEN npx playwright test e2e/token.spec.ts
const URL_ = process.env.TOKEN_URL;
const TOKEN = process.env.INVITE_TOKEN;
test.skip(!URL_ || !TOKEN, "set TOKEN_URL and INVITE_TOKEN to run against a token-mode server");

test("without a token: no sign-in button, asks for an invite", async ({ page }) => {
  await page.goto(`${URL_}/?now=2026-11-10T09:00:00-07:00`);
  await page.waitForSelector(".row");
  await page.getByRole("button", { name: "Sync and settings" }).click();
  await expect(page.getByText(/^Not signed in/)).toBeVisible();
  await expect(page.getByText(/invite link from whoever runs this server/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in to sync" })).toHaveCount(0);
});

test("an invite link signs the device in and stars sync", async ({ page }) => {
  await page.goto(`${URL_}/?now=2026-11-10T09:00:00-07:00#token=${TOKEN}`);
  await page.waitForSelector(".row");
  expect(page.url()).not.toContain("token=");
  const id = await page.locator(".row").nth(1).getAttribute("data-id");
  await page.locator(".row").nth(1).locator(".star").click();
  await page.getByRole("button", { name: "Sync and settings" }).click();
  await page.getByRole("button", { name: "Sync now" }).click();
  await expect(page.getByText(/^Synced/)).toBeVisible();
  await expect(page.getByText(/Signed in as tester/)).toBeVisible();
  const server = await (await page.request.get(`${URL_}/sync/stars?event=kccncna2026`, { headers: { authorization: `Bearer ${TOKEN}` } })).json();
  expect(server.records.find((r: { id: string }) => r.id === id)?.starred).toBe(true);
});
