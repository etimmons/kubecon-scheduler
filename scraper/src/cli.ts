// Usage: node scraper/src/cli.ts [out.json] [--fixture path.json[.gz]]
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { EventConfig } from "../../shared/types.ts";
import { fetchSchedule } from "./fetch.ts";
import { parseSessionize, sourceHash } from "./parse.ts";

const cfg = JSON.parse(readFileSync(new URL("../../events/kccncna2026.json", import.meta.url), "utf8")) as EventConfig;
const args = process.argv.slice(2);
const fi = args.indexOf("--fixture");
const out = args.find((a, i) => !a.startsWith("--") && (fi < 0 || i !== fi + 1)) ?? "app/public/schedule.json";

let schedule;
if (fi >= 0) {
  const path = args[fi + 1];
  const buf = readFileSync(path);
  const raw = path.endsWith(".gz") ? gunzipSync(buf) : buf;
  schedule = parseSessionize(JSON.parse(raw.toString("utf8")), cfg, { hash: sourceHash(raw) });
} else {
  schedule = await fetchSchedule(cfg);
}
writeFileSync(out, JSON.stringify(schedule));
console.log(`wrote ${schedule.sessions.length} sessions to ${out}`);
