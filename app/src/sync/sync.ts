import type { StarRecord } from "../../../shared/types.ts";

export type SyncResult =
  | { ok: true; records: StarRecord[]; user?: string }
  | { ok: false; reason: "signed-out" | "offline" | "error" | "unavailable"; message?: string };

/**
 * PUT local records; the server merges by updatedAt and returns the merged set.
 * With a device token, uses /sync/* (bearer auth, no forward-auth); otherwise /api/* behind
 * Authelia. A redirect (to the login portal) or 401/403 means signed out.
 */
export async function syncStars(eventId: string, records: StarRecord[], token: string | null): Promise<SyncResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return { ok: false, reason: "offline" };
  const base = token ? "sync" : "api";
  let res: Response;
  try {
    res = await fetch(`${base}/stars?event=${encodeURIComponent(eventId)}`, {
      method: "PUT",
      redirect: "manual",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ records: records.map(({ changedFrom: _c, ...r }) => r) }),
    });
  } catch (e) {
    return { ok: false, reason: "offline", message: String(e) };
  }
  if (res.type === "opaqueredirect" || res.status === 0 || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    return { ok: false, reason: "signed-out" };
  }
  if (res.status === 404) return { ok: false, reason: "unavailable" };
  if (!res.ok) return { ok: false, reason: "error", message: `HTTP ${res.status}` };
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return { ok: false, reason: "signed-out" }; // login page served with 200
  const body = (await res.json()) as { records: StarRecord[]; user?: string };
  return { ok: true, records: body.records ?? [], user: body.user };
}

/** Ask the server for a long-lived device token (requires an Authelia session). */
export async function requestDeviceToken(): Promise<string | null> {
  try {
    const res = await fetch("api/device-token", {
      method: "POST",
      redirect: "manual",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return null;
    return ((await res.json()) as { token: string }).token ?? null;
  } catch {
    return null;
  }
}

/** Where "Sign in to sync" goes: a protected URL that bounces back to the app after login. */
export function signInUrl(): string {
  const back = location.href;
  return `api/login?return=${encodeURIComponent(back)}`;
}
