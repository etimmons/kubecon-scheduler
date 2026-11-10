// Renders app/public/icon.svg to the PNG sizes the manifest and iOS need.
// Usage: node scripts/icons.ts
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("app/public/icon.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-512-maskable.png", 512, 0.1],
  ["apple-touch-icon.png", 180, 0],
] as const) {
  await page.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await page.setContent(
    `<body style="margin:0;background:#1f2a5c;display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace("<svg ", `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  await page.screenshot({ path: `app/public/${name}`, omitBackground: false });
}
await browser.close();
console.log("icons written");
