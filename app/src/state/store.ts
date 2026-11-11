import { useEffect, useState } from "preact/hooks";
import type { ScheduleFile, Session } from "../../../shared/types.ts";
import { applyFilters, filterKey, indexSchedule, type FilterState, type Indexed } from "../filters/filter.ts";
import { buildSearch, parseRoute, type Route } from "../routes/url.ts";
import { syncStars } from "../sync/sync.ts";
import {
  cachedSchedule,
  cleanupOldCaches,
  loadDeviceToken,
  loadNowStarredOnly,
  loadSyncMode,
  loadStars,
  loadSyncMeta,
  networkSchedule,
  saveDeviceToken,
  saveNowStarredOnly,
  saveSyncMode,
  saveStars,
  saveSyncMeta,
  type SyncMeta,
  type SyncMode,
} from "./storage.ts";
import { detectChanges, dismissChange, mergeStars, toggleStar, type StarMap } from "./stars.ts";

export type SyncState = "idle" | "syncing" | "signed-out" | "offline" | "error" | "unavailable";

export interface AppState {
  schedule: ScheduleFile | null;
  items: Indexed[];
  byId: Map<string, Session>;
  ixById: Map<string, Indexed>;
  loadError: string | null;
  refreshing: boolean;
  route: Route;
  nowMs: number;
  defaultShowPast: boolean;
  stars: StarMap;
  sync: { state: SyncState; meta: SyncMeta; message?: string; token: string | null; mode: SyncMode };
  /** IDs the detail sheet steps through (the list it was opened from). */
  detailContext: string[] | null;
  /** Now tab shows only starred sessions. */
  nowStarredOnly: boolean;
}

const emptyRoute: Route = {
  filters: { sel: {}, search: "", showPast: false },
  tab: "schedule",
  day: null,
  id: null,
  sheet: null,
  now: null,
};

let state: AppState = {
  schedule: null,
  items: [],
  byId: new Map(),
  ixById: new Map(),
  loadError: null,
  refreshing: false,
  route: emptyRoute,
  nowMs: Date.now(),
  defaultShowPast: false,
  stars: {},
  sync: { state: "idle", meta: {}, token: null, mode: loadSyncMode() },
  detailContext: null,
  nowStarredOnly: loadNowStarredOnly(),
};

const listeners = new Set<() => void>();
export const getState = () => state;
function set(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useApp(): AppState {
  const [, force] = useState(0);
  const rendered = state;
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    // Effects run after paint: catch any update that landed before we subscribed.
    if (state !== rendered) l();
    return () => void listeners.delete(l);
  }, []);
  return state;
}

// ---- clock -------------------------------------------------------------------------------

let clockOffset = 0; // debug ?now= override, as an offset so time still ticks
const nowMs = () => Date.now() + clockOffset;

function computeDefaultShowPast(schedule: ScheduleFile, now: number): boolean {
  // Hide past sessions during (and before) the event; show them once it is over.
  const lastEnd = schedule.sessions.reduce((m, s) => Math.max(m, Date.parse(s.end)), 0);
  return now >= lastEnd;
}

// ---- schedule ------------------------------------------------------------------------------

function applySchedule(schedule: ScheduleFile) {
  const items = indexSchedule(schedule);
  const byId = new Map(schedule.sessions.map((s) => [s.id, s]));
  const ixById = new Map(items.map((i) => [i.s.id, i]));
  let stars = state.stars;
  if (!state.schedule || state.schedule.event.id !== schedule.event.id) {
    stars = loadStars(schedule.event.id);
  }
  const det = detectChanges(stars, byId);
  if (det.changed) saveStars(schedule.event.id, det.stars);
  const now = nowMs();
  const defaultShowPast = computeDefaultShowPast(schedule, now);
  const route = parseRoute(location.search, schedule.facets, defaultShowPast);
  const first = !state.schedule;
  set({
    schedule,
    items,
    byId,
    ixById,
    stars: det.stars,
    route,
    defaultShowPast,
    nowMs: now,
    loadError: null,
    sync: first
      ? { ...state.sync, meta: loadSyncMeta(schedule.event.id), token: loadDeviceToken() }
      : state.sync,
  });
}

export async function refreshSchedule(): Promise<void> {
  set({ refreshing: true });
  try {
    const fresh = await networkSchedule();
    if (!state.schedule || fresh.sourceHash !== state.schedule.sourceHash || fresh.scrapedAt !== state.schedule.scrapedAt) {
      applySchedule(fresh);
    }
    set({ refreshing: false });
  } catch (e) {
    set({ refreshing: false, loadError: state.schedule ? null : `Couldn't load the schedule (${String(e)}).` });
  }
}

export async function boot(): Promise<void> {
  const p = new URLSearchParams(location.search).get("now");
  if (p && !Number.isNaN(Date.parse(p))) clockOffset = Date.parse(p) - Date.now();
  set({ nowMs: nowMs() });
  acceptInviteLink();

  void cleanupOldCaches();
  const cached = await cachedSchedule();
  if (cached) applySchedule(cached);
  const net = refreshSchedule();
  if (!cached) await net;

  window.addEventListener("popstate", () => {
    if (!state.schedule) return;
    const prev = state.route;
    const route = parseRoute(location.search, state.schedule.facets, state.defaultShowPast);
    // Closing a sheet with back: filter edits made inside it were written to the sheet's
    // history entry, so carry them forward onto the list entry we just returned to.
    const closedSheet = (prev.sheet || prev.id) && !route.sheet && !route.id;
    if (closedSheet && filterKey(prev.filters) !== filterKey(route.filters)) {
      const next = { ...route, filters: prev.filters };
      const url = location.pathname + buildSearch(next, state.schedule.facets, state.defaultShowPast) + location.hash;
      history.replaceState(history.state, "", url);
      set({ route: next });
      return;
    }
    set({ route });
  });
  setInterval(() => set({ nowMs: nowMs() }), 30_000);
  // Re-check the schedule every 30 min while open, and whenever the app returns to the foreground.
  setInterval(() => void refreshSchedule(), 30 * 60_000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      set({ nowMs: nowMs() });
      void refreshSchedule();
      void syncNow();
    }
  });
  window.addEventListener("online", () => void syncNow());
  setInterval(() => {
    if (document.visibilityState === "visible") void syncNow({ quiet: true });
  }, 45_000);
  void loadSyncConfig().then(() => syncNow());
}

/** An invite link (…/#token=ks_…) signs this device in; the token never reaches the server's logs. */
function acceptInviteLink() {
  const m = /(?:^#|&)token=(ks_[A-Za-z0-9_-]{20,})/.exec(location.hash);
  if (!m) return;
  saveDeviceToken(m[1]);
  history.replaceState(history.state, "", location.pathname + location.search);
}

/** Ask the server how sync works here (token, header, or off for the static build). Keeps the cached answer offline. */
async function loadSyncConfig() {
  try {
    const res = await fetch("app-config.json", { cache: "no-cache", headers: { accept: "application/json" } });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) return;
    const mode = ((await res.json()) as { sync?: string }).sync;
    if (mode === "header" || mode === "token" || mode === "off") {
      saveSyncMode(mode);
      set({ sync: { ...state.sync, mode } });
    }
  } catch {
    /* offline: keep the cached mode */
  }
}

// ---- navigation ------------------------------------------------------------------------------

type Mode = "push" | "replace";

export function navigate(patch: Partial<Route>, mode: Mode = "replace") {
  if (!state.schedule) return;
  const route = { ...state.route, ...patch };
  const url = location.pathname + buildSearch(route, state.schedule.facets, state.defaultShowPast) + location.hash;
  if (mode === "push") history.pushState({ sheet: true }, "", url);
  else history.replaceState(history.state, "", url);
  set({ route });
}

export function setFilters(filters: FilterState) {
  navigate({ filters });
}

export function openDetail(id: string, context: string[] | null) {
  set({ detailContext: context });
  if (state.route.id) navigate({ id }, "replace");
  else navigate({ id }, "push");
}

/** Close a sheet: go back if we pushed it (so browser back and the button agree), else replace. */
export function closeSheet(which: "detail" | "sheet", then?: () => void) {
  const pushed = (history.state as { sheet?: boolean } | null)?.sheet;
  if (pushed) {
    // The boot-time popstate listener runs first and restores the route; then `then`.
    if (then) window.addEventListener("popstate", () => then(), { once: true });
    history.back();
    return;
  }
  navigate(which === "detail" ? { id: null } : { sheet: null }, "replace");
  then?.();
}

export function openSheet(sheet: "filters" | "settings") {
  navigate({ sheet }, "push");
}

/** The current Schedule-tab list, used for detail prev/next. */
export function filteredList(): Indexed[] {
  return applyFilters(state.items, state.route.filters, state.nowMs);
}

// ---- stars -------------------------------------------------------------------------------

let syncTimer: ReturnType<typeof setTimeout> | null = null;

function commitStars(stars: StarMap, dirty: boolean) {
  if (!state.schedule) return;
  saveStars(state.schedule.event.id, stars);
  const meta = dirty ? { ...state.sync.meta, dirty: true } : state.sync.meta;
  if (dirty) saveSyncMeta(state.schedule.event.id, meta);
  set({ stars, sync: { ...state.sync, meta } });
  if (dirty) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), 5000);
  }
}

export function toggle(id: string) {
  const s = state.byId.get(id);
  if (s) {
    commitStars(toggleStar(state.stars, s), true);
    return;
  }
  // Orphaned star: unstar from its snapshot.
  const r = state.stars[id];
  if (r) commitStars({ ...state.stars, [id]: { ...r, starred: !r.starred, updatedAt: new Date().toISOString() } }, true);
}

export function setNowStarredOnly(v: boolean) {
  saveNowStarredOnly(v);
  set({ nowStarredOnly: v });
}

export function dismiss(id: string) {
  commitStars(dismissChange(state.stars, id), false);
}

// ---- sync --------------------------------------------------------------------------------

let syncing = false;

export async function syncNow(opts: { quiet?: boolean } = {}): Promise<void> {
  if (!state.schedule || syncing) return;
  const eventId = state.schedule.event.id;
  // No server to sync with, or token-only and this device has no token: don't ask.
  if (state.sync.mode === "off") return set({ sync: { ...state.sync, state: "unavailable", message: undefined } });
  if (state.sync.mode === "token" && !state.sync.token) return set({ sync: { ...state.sync, state: "signed-out", message: undefined } });
  syncing = true;
  if (!opts.quiet) set({ sync: { ...state.sync, state: "syncing" } });
  const sent = state.stars;
  const res = await syncStars(eventId, Object.values(sent), state.sync.token);
  syncing = false;
  if (!res.ok) {
    set({ sync: { ...state.sync, state: res.reason, message: res.message } });
    return;
  }
  // Merge the server's answer into whatever is local now (stars may have changed in flight).
  const merged = mergeStars(state.stars, res.records);
  const det = detectChanges(merged, state.byId);
  const dirty = state.stars !== sent; // a change landed while we were syncing
  const meta: SyncMeta = { lastSync: new Date().toISOString(), user: res.user, dirty };
  saveSyncMeta(eventId, meta);
  saveStars(eventId, det.stars);
  set({ stars: det.stars, sync: { ...state.sync, state: "idle", meta, message: undefined } });
  if (dirty) {
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => void syncNow(), 5000);
  }
}

export function setDeviceToken(token: string | null) {
  saveDeviceToken(token);
  set({ sync: { ...state.sync, token } });
  void syncNow();
}
