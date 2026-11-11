import type { FacetDef, ScheduleFile, Session } from "../../../shared/types.ts";

/** Selected value slugs per facet key, plus search and the past toggle. */
export interface FilterState {
  sel: Record<string, string[]>;
  search: string;
  showPast: boolean;
}

export const emptyFilters = (): FilterState => ({ sel: {}, search: "", showPast: false });

export interface Indexed {
  s: Session;
  hay: string; // lowercased, accent-folded search text
  startMs: number;
  endMs: number;
}

export function fold(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}+/gu, "").toLowerCase();
}

export function indexSchedule(schedule: ScheduleFile): Indexed[] {
  const names = new Map<string, Map<string, string>>();
  for (const f of schedule.facets) names.set(f.key, new Map(f.values.map((v) => [v.slug, v.name])));
  return schedule.sessions.map((s) => {
    const tags: string[] = [];
    for (const [k, vals] of Object.entries(s.facets)) {
      if (k === "date" || k === "slides") continue;
      for (const v of vals) tags.push(names.get(k)?.get(v) ?? v);
    }
    const parts = [
      s.title,
      s.abstract,
      s.speakerLine ?? "",
      ...s.speakers.flatMap((p) => [p.name, p.company ?? "", p.title ?? ""]),
      ...tags,
      s.location.path.join(" "),
    ];
    return { s, hay: fold(parts.join("\n")), startMs: Date.parse(s.start), endMs: Date.parse(s.end) };
  });
}

export function searchTerms(q: string): string[] {
  return fold(q).split(/\s+/).filter(Boolean);
}

/** Every search term must appear somewhere (AND). */
export function matchesSearch(ix: Indexed, terms: string[]): boolean {
  for (const t of terms) if (!ix.hay.includes(t)) return false;
  return true;
}

function facetMatch(ix: Indexed, key: string, selected: string[] | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  const vals = ix.s.facets[key];
  if (!vals) return false;
  for (const v of vals) if (selected.includes(v)) return true; // OR within a facet
  return false;
}

function basePass(ix: Indexed, terms: string[], state: FilterState, nowMs: number): boolean {
  if (!state.showPast && ix.endMs <= nowMs) return false;
  return matchesSearch(ix, terms);
}

/** AND across facets, OR within a facet, combined with search and the past toggle. */
export function applyFilters(items: Indexed[], state: FilterState, nowMs: number): Indexed[] {
  const terms = searchTerms(state.search);
  const keys = Object.keys(state.sel).filter((k) => state.sel[k]?.length);
  return items.filter((ix) => basePass(ix, terms, state, nowMs) && keys.every((k) => facetMatch(ix, k, state.sel[k])));
}

export type Counts = Record<string, Record<string, number>>;

/**
 * For each facet option, the number of sessions the list would show with that option
 * selected (on top of every other facet's current selection). One pass: a session that
 * fails exactly one facet only counts toward that facet's options.
 */
export function facetCounts(items: Indexed[], state: FilterState, facets: FacetDef[], nowMs: number): Counts {
  const terms = searchTerms(state.search);
  const counts: Counts = {};
  for (const f of facets) counts[f.key] = Object.fromEntries(f.values.map((v) => [v.slug, 0]));
  const active = facets.filter((f) => state.sel[f.key]?.length).map((f) => f.key);
  for (const ix of items) {
    if (!basePass(ix, terms, state, nowMs)) continue;
    let failing: string | null = null;
    let fails = 0;
    for (const k of active) {
      if (!facetMatch(ix, k, state.sel[k])) {
        failing = k;
        if (++fails > 1) break;
      }
    }
    if (fails > 1) continue;
    for (const f of facets) {
      if (fails === 1 && f.key !== failing) continue;
      const c = counts[f.key];
      for (const v of ix.s.facets[f.key] ?? []) if (v in c) c[v]++;
    }
  }
  return counts;
}

export function activeFilterCount(state: FilterState): number {
  return Object.values(state.sel).reduce((n, v) => n + (v?.length ?? 0), 0);
}

export function toggleValue(state: FilterState, key: string, slug: string): FilterState {
  const cur = state.sel[key] ?? [];
  const next = cur.includes(slug) ? cur.filter((v) => v !== slug) : [...cur, slug];
  return { ...state, sel: { ...state.sel, [key]: next } };
}

/** Stable key for per-view scroll memory. */
export function filterKey(state: FilterState): string {
  const parts = Object.keys(state.sel)
    .filter((k) => state.sel[k]?.length)
    .sort()
    .map((k) => `${k}=${[...state.sel[k]].sort().join("|")}`);
  return [...parts, `search=${state.search.trim()}`, `past=${state.showPast}`].join("&");
}

const RECENT_MS = 60 * 60_000;

/**
 * Where "now" is in a start-sorted list: the earliest session that started within the last
 * hour and is still running, else the first one that hasn't started yet. Long-running items
 * (booths, all-day tracks) don't pin the anchor to the morning. Null when everything is over.
 */
export function nowAnchor(list: Indexed[], nowMs: number): Indexed | null {
  let live: Indexed | null = null;
  for (const ix of list) {
    if (ix.startMs > nowMs) return live ?? ix;
    if (!live && nowMs < ix.endMs && nowMs - ix.startMs <= RECENT_MS) live = ix;
  }
  return live;
}
