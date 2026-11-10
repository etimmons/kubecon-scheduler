import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scraper/test/**/*.test.ts", "server/test/**/*.test.ts", "app/src/**/*.test.ts", "shared/**/*.test.ts"],
  },
});
