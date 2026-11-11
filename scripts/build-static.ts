// Build a standalone site with schedule data and device-local stars.
// Pass --fixture <path> to build offline using the scraper's committed fixture.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { build } from "vite";

await build({ configFile: "app/vite.config.ts" });

// Write after Vite empties dist/app, so no generated files are needed in app/public.
// A failed scrape fails the deployment, leaving the previous deployment in place.
const scrape = spawnSync(process.execPath, [
  "scraper/src/cli.ts",
  "dist/app/schedule.json",
  ...process.argv.slice(2),
], { stdio: "inherit" });
if (scrape.error) throw scrape.error;
if (scrape.status !== 0) process.exit(scrape.status ?? 1);

writeFileSync("dist/app/app-config.json", JSON.stringify({ sync: "off" }));
