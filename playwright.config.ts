import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  use: { baseURL: "http://localhost:5174", ...devices["iPhone 13"], browserName: "chromium" },
  webServer: {
    command:
      "node scraper/src/cli.ts app/public/schedule.json --fixture scraper/fixtures/sessionize-all-2026-11-10.json.gz && npx vite --config app/vite.config.ts --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
  },
});
