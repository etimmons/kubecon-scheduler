import type { FacetDef } from "../../../shared/types.ts";
import type { FilterState } from "../filters/filter.ts";

// URL contract mirrors the LF schedule page: one parameter per filter group, slugged values
// joined by "|", `search` for free text, `id` for the open session, `slides=uploaded`.
// This app adds `tab`, `day` (My Schedule's day, e.g. wed-nov-11, or all), `past=show`,
// `sheet=filters|settings`, and the debug `now`.

export type Tab = "schedule" | "mine" | "now";
export type Sheet = "filters" | "settings" | null;

export interface Route {
  filters: FilterState;
  tab: Tab;
  /**
   * My Schedule's day tab: a date slug, "all", or null for the default (today, during the event).
   * Separate from the Schedule tab's date filter.
   */
  day: string | null;
  id: string | null;
  sheet: Sheet;
  now: string | null;
}

export function parseRoute(search: string, facets: FacetDef[], defaultShowPast: boolean): Route {
  const p = new URLSearchParams(search);
  const sel: Record<string, string[]> = {};
  for (const f of facets) {
    const raw = p.get(f.key);
    if (!raw) continue;
    const known = new Set(f.values.map((v) => v.slug));
    const vals = raw.split("|").map((v) => v.trim()).filter((v) => known.has(v));
    if (vals.length) sel[f.key] = [...new Set(vals)];
  }
  const past = p.get("past");
  const tab = p.get("tab");
  const sheet = p.get("sheet");
  return {
    filters: {
      sel,
      search: p.get("search") ?? p.get("q") ?? "",
      showPast: past === "show" ? true : past === "hide" ? false : defaultShowPast,
    },
    tab: tab === "mine" || tab === "now" ? tab : "schedule",
    day: /^([a-z]{3}-[a-z]{3}-\d{1,2}|all)$/.test(p.get("day") ?? "") ? p.get("day") : null,
    id: p.get("id") ?? p.get("s"),
    sheet: sheet === "filters" || sheet === "settings" ? sheet : null,
    now: p.get("now"),
  };
}

export function buildSearch(r: Route, facets: FacetDef[], defaultShowPast: boolean): string {
  const p = new URLSearchParams();
  if (r.tab !== "schedule") p.set("tab", r.tab);
  if (r.day) p.set("day", r.day);
  for (const f of facets) {
    const v = r.filters.sel[f.key];
    if (v?.length) p.set(f.key, v.join("|"));
  }
  if (r.filters.search.trim()) p.set("search", r.filters.search);
  if (r.filters.showPast !== defaultShowPast) p.set("past", r.filters.showPast ? "show" : "hide");
  if (r.now) p.set("now", r.now);
  if (r.sheet) p.set("sheet", r.sheet);
  if (r.id) p.set("id", r.id);
  // Keep "|" readable; URLSearchParams encodes it as %7C, which the LF page also accepts.
  const s = p.toString().replace(/%7C/gi, "|");
  return s ? `?${s}` : "";
}
