import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { StarRecord } from "../../shared/types.ts";
import { cfg } from "../../scraper/test/load.ts";
import { createHandler, safeReturn } from "../src/app.ts";
import { DeviceTokens } from "../src/auth.ts";
import { nextInterval, ScheduleKeeper } from "../src/refresh.ts";
import { cleanRecords, mergeLww, StarStore, userKey } from "../src/stars.ts";

const fixtureRaw = gunzipSync(readFileSync(new URL("../../scraper/fixtures/sessionize-all-2026-11-10.json.gz", import.meta.url))).toString("utf8");

// A fake Sessionize: serves the fixture, or a broken/shrunken body on demand.
let sourceMode: "ok" | "500" | "tiny" | "garbage" = "ok";
const fakeFetch = (async () => {
  if (sourceMode === "500") return new Response("down", { status: 500 });
  if (sourceMode === "garbage") return new Response("<html>not json</html>", { status: 200 });
  if (sourceMode === "tiny") {
    const d = JSON.parse(fixtureRaw);
    d.sessions = d.sessions.slice(0, 50);
    return new Response(JSON.stringify(d), { status: 200 });
  }
  return new Response(fixtureRaw, { status: 200 });
}) as typeof fetch;

let dir: string;
let server: Server;
let base: string;
let keeper: ScheduleKeeper;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "spellbook-"));
  keeper = new ScheduleKeeper(cfg, dir, null, fakeFetch, () => {});
  await keeper.load();
  const handler = createHandler({
    cfg,
    keeper,
    stars: new StarStore(dir),
    tokens: new DeviceTokens(dir),
    statics: null,
    userHeader: "Remote-User",
  });
  server = createServer((q, s) => void handler(q, s));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const rec = (id: string, starred: boolean, updatedAt: string): StarRecord => ({
  id,
  starred,
  updatedAt,
  snapshot: { title: id, start: "2026-11-11T10:00:00-07:00", end: "2026-11-11T10:30:00-07:00", room: "Hall DE" },
});

const put = (records: StarRecord[], headers: Record<string, string>) =>
  fetch(`${base}/api/stars?event=${cfg.id}`, {
    method: "PUT",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ records }),
  });

describe("schedule refresh", () => {
  it("serves 503 before the first scrape, then the scraped schedule with ETag and gzip", async () => {
    expect((await fetch(`${base}/schedule.json`)).status).toBe(503);
    const st = await keeper.refresh();
    expect(st.sessions).toBe(601);
    const res = await fetch(`${base}/schedule.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");
    const body = await res.json();
    expect(body.sessions).toHaveLength(601);
    const again = await fetch(`${base}/schedule.json`, { headers: { "if-none-match": res.headers.get("etag")! } });
    expect(again.status).toBe(304);
    expect(JSON.parse(await readFile(join(dir, "schedule.last-good.json"), "utf8")).sessions).toHaveLength(601);
  });

  it("a forced scrape failure leaves the last good schedule live", async () => {
    const before = keeper.current!.etag;
    for (const mode of ["500", "garbage", "tiny"] as const) {
      sourceMode = mode;
      const st = await keeper.refresh();
      expect(st.lastError, mode).toBeTruthy();
      expect(keeper.current!.etag).toBe(before);
      expect((await (await fetch(`${base}/schedule.json`)).json()).sessions).toHaveLength(601);
    }
    expect(keeper.status.lastError).toMatch(/below 80%/);
    sourceMode = "ok";
    expect((await keeper.refresh()).lastError).toBeUndefined();
  });

  it("reloads from disk after a restart", async () => {
    const k2 = new ScheduleKeeper(cfg, dir, null, fakeFetch, () => {});
    await k2.load();
    expect(k2.current?.file.sessions).toHaveLength(601);
  });

  it("scrapes every 30 min on event days, daily otherwise", () => {
    expect(nextInterval(cfg, Date.parse("2026-11-11T12:00:00-07:00"))).toBe(30 * 60_000);
    expect(nextInterval(cfg, Date.parse("2026-11-07T12:00:00-07:00"))).toBe(30 * 60_000); // day before
    expect(nextInterval(cfg, Date.parse("2026-12-01T12:00:00-07:00"))).toBe(24 * 60 * 60_000);
  });
});

describe("/api auth", () => {
  it("requires Remote-User on /api and never reads it on /sync", async () => {
    expect((await fetch(`${base}/api/stars`)).status).toBe(401);
    expect((await fetch(`${base}/api/me`, { headers: { "remote-user": "alice" } })).status).toBe(200);
    expect((await fetch(`${base}/sync/stars`, { headers: { "remote-user": "alice" } })).status).toBe(401);
  });
  it("rejects paths an ingress might route differently", async () => {
    // Raw requests: fetch() would normalize "/x/../" away before sending.
    const raw = (path: string) =>
      new Promise<number>((resolve, reject) => {
        const u = new URL(base);
        const r = request({ host: u.hostname, port: u.port, path, headers: { "remote-user": "alice" } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        r.on("error", reject);
        r.end();
      });
    for (const p of ["//api/stars", "/%61pi/stars", "/api%2fstars", "/x/../api/stars", "/api/../api/stars"]) {
      expect(await raw(p), p).toBe(400);
    }
  });
  it("login only redirects within the site", () => {
    expect(safeReturn("https://kubecon.example/?tab=mine", "kubecon.example")).toBe("/?tab=mine");
    expect(safeReturn("https://evil.example/", "kubecon.example")).toBe("/");
    expect(safeReturn("//evil.example/", "kubecon.example")).toBe("/");
    expect(safeReturn(null, "kubecon.example")).toBe("/");
  });
});

describe("star sync", () => {
  it("a star and an unstar made offline on one device reach the other after both reconnect", async () => {
    const H = { "remote-user": "alice" };
    // Both devices start with A starred.
    await put([rec("A", true, "2026-11-10T09:00:00.000Z")], H);
    // Offline on the phone: unstar A, star B. Meanwhile the iPad (also offline) stars C.
    const phone = [rec("A", false, "2026-11-10T10:00:00.000Z"), rec("B", true, "2026-11-10T10:01:00.000Z")];
    const ipad = [rec("A", true, "2026-11-10T09:00:00.000Z"), rec("C", true, "2026-11-10T10:02:00.000Z")];
    // Reconnect: the phone pushes first, then the iPad.
    await put(phone, H);
    const ipadView = (await (await put(ipad, H)).json()).records as StarRecord[];
    const state = Object.fromEntries(ipadView.map((r) => [r.id, r.starred]));
    expect(state).toEqual({ A: false, B: true, C: true });
    // The phone's next sync sees C as well.
    const phoneView = (await (await put(phone, H)).json()).records as StarRecord[];
    expect(Object.fromEntries(phoneView.map((r) => [r.id, r.starred]))).toEqual(state);
  });

  it("keeps users separate", async () => {
    const r = await fetch(`${base}/api/stars?event=${cfg.id}`, { headers: { "remote-user": "someone-else" } });
    expect((await r.json()).records).toEqual([]);
  });

  it("device tokens work on /sync and map to the issuing user", async () => {
    const t = (await (await fetch(`${base}/api/device-token`, { method: "POST", headers: { "remote-user": "alice" } })).json()).token;
    expect(t).toMatch(/^sb_/);
    const r = await fetch(`${base}/sync/stars?event=${cfg.id}`, { headers: { authorization: `Bearer ${t}` } });
    expect(r.status).toBe(200);
    expect((await r.json()).records.map((x: StarRecord) => x.id).sort()).toEqual(["A", "B", "C"]);
    const bad = await fetch(`${base}/sync/stars`, { headers: { authorization: `Bearer sb_${"x".repeat(43)}` } });
    expect(bad.status).toBe(401);
    // Tokens are stored hashed.
    expect(await readFile(join(dir, "tokens.json"), "utf8")).not.toContain(t);
  });

  it("validates input and rejects bad event ids", async () => {
    expect(cleanRecords([{ id: "x", starred: "yes", updatedAt: "now" }, null, rec("ok", true, "2026-11-10T10:00:00Z")])).toHaveLength(1);
    const r = await fetch(`${base}/api/stars?event=../../etc`, { headers: { "remote-user": "alice" } });
    expect(r.status).toBe(400);
    expect(userKey("../../root")).not.toContain("/");
    expect(userKey("..")).toBe("_");
  });

  it("merge: latest updatedAt wins, ties keep stored", () => {
    const m = mergeLww([rec("a", true, "2026-11-10T10:00:00Z")], [rec("a", false, "2026-11-10T10:00:00Z"), rec("b", true, "2026-11-10T10:00:00Z")]);
    expect(m.map((r) => [r.id, r.starred])).toEqual([["a", true], ["b", true]]);
  });
});
