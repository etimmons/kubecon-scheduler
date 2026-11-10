import type { IncomingMessage, ServerResponse } from "node:http";
import type { EventConfig } from "../../shared/types.ts";
import { DeviceTokens, remoteUser } from "./auth.ts";
import type { ScheduleKeeper } from "./refresh.ts";
import { cleanRecords, StarStore } from "./stars.ts";
import { SECURITY_HEADERS, send, type StaticFiles } from "./static.ts";

export interface AppDeps {
  cfg: EventConfig;
  keeper: ScheduleKeeper;
  stars: StarStore;
  tokens: DeviceTokens;
  statics: StaticFiles | null;
  userHeader: string;
  devUser?: string;
}

const MAX_BODY = 1_000_000;

function json(res: ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}) {
  const b = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": String(b.length),
    ...extra,
  });
  res.end(b);
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let n = 0;
  for await (const c of req) {
    n += (c as Buffer).length;
    if (n > MAX_BODY) throw Object.assign(new Error("body too large"), { status: 413 });
    chunks.push(c as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("invalid JSON"), { status: 400 });
  }
}

/** Same-origin relative return paths only, so /api/login can't be used as an open redirect. */
export function safeReturn(raw: string | null, host: string | undefined): string {
  if (!raw) return "/";
  try {
    const base = `https://${host ?? "localhost"}`;
    const u = new URL(raw, base);
    if (u.origin !== new URL(base).origin) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}

async function starsRoute(req: IncomingMessage, res: ServerResponse, url: URL, user: string, d: AppDeps) {
  const eventId = url.searchParams.get("event") ?? d.cfg.id;
  if (!/^[a-z0-9-]{1,64}$/.test(eventId)) return json(res, 400, { error: "bad event id" });
  if (req.method === "GET") {
    return json(res, 200, { user, records: await d.stars.get(user, eventId) });
  }
  if (req.method === "PUT") {
    const body = (await readBody(req)) as { records?: unknown };
    const merged = await d.stars.merge(user, eventId, cleanRecords(body?.records));
    return json(res, 200, { user, records: merged });
  }
  return json(res, 405, { error: "method not allowed" }, { allow: "GET, PUT" });
}

export function createHandler(d: AppDeps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const rawPath = (req.url ?? "/").split("?")[0];
    // Route on the raw path. Refuse anything an ingress might route differently than we do.
    if (/%|\/\/|\\/.test(rawPath) || rawPath.split("/").some((seg) => seg === ".." || seg === ".")) {
      return json(res, 400, { error: "bad path" });
    }
    const url = new URL(req.url ?? "/", "http://local");
    try {
      if (rawPath === "/healthz") return json(res, 200, { ok: true, schedule: !!d.keeper.current });

      if (rawPath === "/schedule.json") {
        const cur = d.keeper.current;
        if (!cur) return json(res, 503, { error: "schedule not loaded yet" });
        return send(req, res, cur.body, cur.gz, "application/json; charset=utf-8", cur.etag, "no-cache");
      }

      if (rawPath.startsWith("/api/")) {
        const user = remoteUser(req, d.userHeader, d.devUser);
        if (!user) return json(res, 401, { error: "sign in required" });
        switch (rawPath) {
          case "/api/me":
            return json(res, 200, { user });
          case "/api/login":
            // Reaching here means forward-auth let us through; bounce back into the app.
            res.writeHead(302, { location: safeReturn(url.searchParams.get("return"), req.headers.host), "cache-control": "no-store" });
            return res.end();
          case "/api/stars":
            return await starsRoute(req, res, url, user, d);
          case "/api/device-token":
            if (req.method !== "POST") return json(res, 405, { error: "method not allowed" }, { allow: "POST" });
            return json(res, 200, { token: await d.tokens.issue(user, String(req.headers["user-agent"] ?? "").slice(0, 120)) });
          case "/api/refresh":
            if (req.method !== "POST") return json(res, 405, { error: "method not allowed" }, { allow: "POST" });
            return json(res, 200, await d.keeper.refresh());
          case "/api/status":
            return json(res, 200, d.keeper.status);
        }
        return json(res, 404, { error: "not found" });
      }

      if (rawPath.startsWith("/sync/")) {
        // Bearer device tokens only; Remote-User is never read here.
        const user = await d.tokens.verify(req);
        if (!user) return json(res, 401, { error: "invalid device token" });
        if (rawPath === "/sync/stars") return await starsRoute(req, res, url, user, d);
        return json(res, 404, { error: "not found" });
      }

      if ((req.method === "GET" || req.method === "HEAD") && d.statics?.serve(req, res, rawPath)) return;
      return json(res, 404, { error: "not found" });
    } catch (e) {
      const status = (e as { status?: number }).status ?? 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) json(res, status, { error: status === 500 ? "internal error" : (e as Error).message });
    }
  };
}
