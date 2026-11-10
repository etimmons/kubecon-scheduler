import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import type { EventConfig } from "../../shared/types.ts";
import { parseSessionize, sourceHash, type SzAll } from "../src/parse.ts";

export const cfg = JSON.parse(
  readFileSync(new URL("../../events/kccncna2026.json", import.meta.url), "utf8"),
) as EventConfig;

export function loadFixture(): SzAll {
  const raw = gunzipSync(readFileSync(new URL("../fixtures/sessionize-all-2026-11-10.json.gz", import.meta.url)));
  return JSON.parse(raw.toString("utf8")) as SzAll;
}

export function parsedFixture() {
  const raw = gunzipSync(readFileSync(new URL("../fixtures/sessionize-all-2026-11-10.json.gz", import.meta.url)));
  return parseSessionize(JSON.parse(raw.toString("utf8")), cfg, {
    hash: sourceHash(raw),
    now: new Date("2026-11-10T18:00:00Z"),
  });
}
