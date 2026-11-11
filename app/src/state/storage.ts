import type { ScheduleFile, StarRecord } from "../../../shared/types.ts";
import type { StarMap } from "./stars.ts";

// Every storage call is wrapped: private mode, quota or blocked storage must never break the app.

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

export function loadStars(eventId: string): StarMap {
  const list = read<StarRecord[]>(`stars:${eventId}`, []);
  const m: StarMap = {};
  for (const r of Array.isArray(list) ? list : []) if (r && r.id) m[r.id] = r;
  return m;
}
export function saveStars(eventId: string, stars: StarMap): void {
  write(`stars:${eventId}`, Object.values(stars));
}

export interface SyncMeta {
  lastSync?: string;
  user?: string;
  dirty?: boolean; // local changes not yet pushed
}
export const loadSyncMeta = (eventId: string) => read<SyncMeta>(`sync:${eventId}`, {});
export const saveSyncMeta = (eventId: string, m: SyncMeta) => write(`sync:${eventId}`, m);

const TOKEN_KEY = "kubecon-scheduler:device-token";
// Read the pre-rename key too, so a saved device token survives the rename.
export const loadDeviceToken = () => read<string | null>(TOKEN_KEY, null) ?? read<string | null>("spellbook:device-token", null);
export const saveDeviceToken = (t: string | null) => write(TOKEN_KEY, t);

// Scroll memory, per view, for the tab's lifetime. A position older than SCROLL_TTL is
// treated as unset, so coming back to the app later opens the list at the current time.
const SCROLL_TTL = 15 * 60_000;
export function loadScroll(key: string): number | null {
  try {
    const v = sessionStorage.getItem(`scroll:${key}`);
    if (v == null) return null;
    const { y, at } = JSON.parse(v) as { y: number; at: number };
    return typeof y === "number" && Date.now() - at < SCROLL_TTL ? y : null;
  } catch {
    return null;
  }
}
export function saveScroll(key: string, y: number): void {
  try {
    sessionStorage.setItem(`scroll:${key}`, JSON.stringify({ y: Math.round(y), at: Date.now() }));
  } catch {
    /* ignore */
  }
}

// How this server does sync, from app-config.json; cached so it's known offline.
export type SyncMode = "header" | "token" | "off";
const SYNC_MODE_KEY = "kubecon-scheduler:sync-mode";
export function loadSyncMode(): SyncMode {
  const v = read<string>(SYNC_MODE_KEY, "header");
  return v === "token" || v === "off" ? v : "header";
}
export const saveSyncMode = (m: SyncMode) => write(SYNC_MODE_KEY, m);

// Now tab: show only starred sessions. A device preference, so it survives relaunching the app.
const NOW_STARRED_KEY = "kubecon-scheduler:now-starred-only";
export const loadNowStarredOnly = () => read<boolean>(NOW_STARRED_KEY, false) === true;
export const saveNowStarredOnly = (v: boolean) => write(NOW_STARRED_KEY, v);

// The schedule itself lives in Cache Storage (app-managed stale-while-revalidate),
// so the first paint uses the last good copy and the network refresh happens behind it.
const SCHEDULE_CACHE = "kubecon-scheduler-schedule-v1";
const OLD_CACHES = ["spellbook-schedule-v1"]; // pre-rename name

/** Drop schedule caches left by earlier names. */
export async function cleanupOldCaches(): Promise<void> {
  try {
    if (typeof caches !== "undefined") await Promise.all(OLD_CACHES.map((c) => caches.delete(c)));
  } catch {
    /* ignore */
  }
}
const SCHEDULE_URL = "schedule.json";

export async function cachedSchedule(): Promise<ScheduleFile | null> {
  try {
    if (typeof caches === "undefined") return null;
    const c = await caches.open(SCHEDULE_CACHE);
    const res = await c.match(SCHEDULE_URL);
    return res ? ((await res.json()) as ScheduleFile) : null;
  } catch {
    return null;
  }
}

export async function networkSchedule(): Promise<ScheduleFile> {
  const res = await fetch(SCHEDULE_URL, { cache: "no-cache", headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`schedule.json ${res.status}`);
  const copy = res.clone();
  const data = (await res.json()) as ScheduleFile;
  if (data?.schemaVersion !== 1 || !Array.isArray(data.sessions)) throw new Error("bad schedule.json");
  try {
    if (typeof caches !== "undefined") await (await caches.open(SCHEDULE_CACHE)).put(SCHEDULE_URL, copy);
  } catch {
    /* ignore */
  }
  return data;
}
