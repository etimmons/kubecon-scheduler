import { describe, expect, it } from "vitest";
import type { FacetDef, ScheduleFile, Session } from "../../../shared/types.ts";
import { parsedFixture } from "../../../scraper/test/load.ts";
import { buildSearch, parseRoute } from "../routes/url.ts";
import { applyFilters, emptyFilters, facetCounts, filterKey, indexSchedule, nowAnchor, type FilterState, type Indexed } from "./filter.ts";

function sess(id: string, facets: Record<string, string[]>, extra: Partial<Session> = {}): Session {
  return {
    id,
    title: `Session ${id}`,
    start: "2026-11-11T10:00:00-07:00",
    end: "2026-11-11T10:30:00-07:00",
    location: { path: ["Salt Palace", "Level 1", "Hall DE"], venue: "Salt Palace", level: "Level 1", room: "Hall DE" },
    speakers: [],
    abstract: "",
    facets,
    links: [],
    ...extra,
  };
}

const facets: FacetDef[] = [
  { key: "cat", label: "Category", values: [{ name: "Security", slug: "security" }, { name: "Platform", slug: "platform" }, { name: "Obs", slug: "obs" }] },
  { key: "lvl", label: "Level", values: [{ name: "Advanced", slug: "advanced" }, { name: "Beginner", slug: "beginner" }] },
];
const schedule: ScheduleFile = {
  schemaVersion: 1,
  event: { id: "t", name: "T", timeZone: "America/Denver", sourceUrl: "" },
  scrapedAt: "",
  sourceHash: "",
  facets,
  sessions: [
    sess("1", { cat: ["security"], lvl: ["advanced"] }),
    sess("2", { cat: ["platform"], lvl: ["advanced"] }),
    sess("3", { cat: ["platform"], lvl: ["beginner"] }),
    sess("4", { cat: ["obs"], lvl: ["advanced"] }),
    sess("5", { cat: ["security", "platform"], lvl: [] }),
  ],
};
const items = indexSchedule(schedule);
const NOW = Date.parse("2026-11-11T08:00:00-07:00");
const ids = (f: FilterState) => applyFilters(items, f, NOW).map((i) => i.s.id);
const withSel = (sel: Record<string, string[]>): FilterState => ({ ...emptyFilters(), sel });

describe("filter semantics", () => {
  it("no selection shows everything", () => {
    expect(ids(emptyFilters())).toEqual(["1", "2", "3", "4", "5"]);
  });
  it("OR within a facet widens", () => {
    expect(ids(withSel({ cat: ["security"] }))).toEqual(["1", "5"]);
    expect(ids(withSel({ cat: ["security", "obs"] }))).toEqual(["1", "4", "5"]);
  });
  it("AND across facets narrows", () => {
    expect(ids(withSel({ cat: ["security", "platform"], lvl: ["advanced"] }))).toEqual(["1", "2"]);
  });
  it("a session missing a facet doesn't match a selection in it", () => {
    expect(ids(withSel({ lvl: ["advanced", "beginner"] }))).toEqual(["1", "2", "3", "4"]);
  });
  it("hides ended sessions unless showPast", () => {
    const later = Date.parse("2026-11-11T10:30:00-07:00");
    expect(applyFilters(items, emptyFilters(), later)).toHaveLength(0);
    expect(applyFilters(items, { ...emptyFilters(), showPast: true }, later)).toHaveLength(5);
    // In progress is not past.
    expect(applyFilters(items, emptyFilters(), later - 1)).toHaveLength(5);
  });
});

describe("facet counts", () => {
  it("with nothing selected, counts sessions per option", () => {
    const c = facetCounts(items, emptyFilters(), facets, NOW);
    expect(c.cat).toEqual({ security: 2, platform: 3, obs: 1 });
    expect(c.lvl).toEqual({ advanced: 3, beginner: 1 });
  });
  it("counts within a facet ignore that facet's own selection (what selecting it would add)", () => {
    const c = facetCounts(items, withSel({ lvl: ["advanced"] }), facets, NOW);
    // Other facets are narrowed by lvl=advanced...
    expect(c.cat).toEqual({ security: 1, platform: 1, obs: 1 });
    // ...but lvl's own options are counted against everything else (nothing else selected).
    expect(c.lvl).toEqual({ advanced: 3, beginner: 1 });
  });
  it("each option's count equals the list size if it alone were selected in that facet", () => {
    const f = withSel({ cat: ["platform"], lvl: ["advanced"] });
    const c = facetCounts(items, f, facets, NOW);
    for (const def of facets) {
      for (const v of def.values) {
        const only = { ...f, sel: { ...f.sel, [def.key]: [v.slug] } };
        expect(c[def.key][v.slug], `${def.key}=${v.slug}`).toBe(ids(only).length);
      }
    }
  });
});

describe("search", () => {
  const real = parsedFixture();
  const all = indexSchedule(real);
  const q = (search: string, sel: Record<string, string[]> = {}) =>
    applyFilters(all, { sel, search, showPast: true }, 0).map((i) => i.s.id);

  it("matches title, speaker, company and tags, case-insensitive, AND across terms", () => {
    expect(q("TOPOGRAPH")).toContain("1234985");
    expect(q("shmulevich")).toContain("1234985");
    expect(q("nvidia topograph")).toEqual(["1234985"]);
    expect(q("anthropic")).toContain("1367757"); // speaker company
    expect(q("kubernetes zzzz-nothing")).toEqual([]);
  });
  it("combines with facets", () => {
    const sec = q("ebpf", { "all-sessions": ["security"] });
    expect(sec.length).toBeGreaterThan(0);
    expect(sec.length).toBeLessThan(q("ebpf").length);
  });
  it("runs well under 100 ms over the full schedule", () => {
    const t0 = performance.now();
    for (const term of ["k", "ku", "kub", "kube", "kuber", "kubernetes"]) q(term);
    const t1 = performance.now();
    expect((t1 - t0) / 6).toBeLessThan(20);
  });
});

describe("URL contract", () => {
  const real = parsedFixture();
  it("parses the LF page's own URL", () => {
    const r = parseRoute(
      "?all-sessions=lightning-talks%7Cdata-processing-plus-storage&audience-level=advanced&date=thu-nov-12",
      real.facets,
      false,
    );
    expect(r.filters.sel).toEqual({
      "all-sessions": ["lightning-talks", "data-processing-plus-storage"],
      "audience-level": ["advanced"],
      date: ["thu-nov-12"],
    });
  });
  it("round-trips filters, search, tab and open session", () => {
    const search = "?tab=mine&all-sessions=security|platform-engineering&audience-level=advanced&date=wed-nov-11&search=ebpf&past=show&id=1234985";
    const r = parseRoute(search, real.facets, false);
    expect(r).toMatchObject({ tab: "mine", id: "1234985", filters: { search: "ebpf", showPast: true } });
    expect(buildSearch(r, real.facets, false)).toBe(search);
  });
  it("keeps My Schedule's day separate from the Schedule date filter", () => {
    const r = parseRoute("?tab=mine&day=wed-nov-11&date=thu-nov-12", real.facets, false);
    expect(r.day).toBe("wed-nov-11");
    expect(r.filters.sel.date).toEqual(["thu-nov-12"]);
    expect(buildSearch(r, real.facets, false)).toBe("?tab=mine&day=wed-nov-11&date=thu-nov-12");
    expect(parseRoute("?day=<script>", real.facets, false).day).toBeNull();
  });
  it("accepts the design doc's q and s aliases and drops unknown slugs", () => {
    const r = parseRoute("?q=ebpf&s=42&all-sessions=security|not-a-category", real.facets, false);
    expect(r.filters.search).toBe("ebpf");
    expect(r.id).toBe("42");
    expect(r.filters.sel["all-sessions"]).toEqual(["security"]);
  });
  it("filterKey ignores selection order", () => {
    const a = withSel({ cat: ["a", "b"] });
    const b = withSel({ cat: ["b", "a"] });
    expect(filterKey(a)).toBe(filterKey(b));
  });
});

describe("nowAnchor", () => {
  const at = (h: number, m = 0) => Date.parse(`2026-11-11T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00-07:00`);
  const ix = (id: string, start: number, end: number): Indexed => ({ s: sess(id, {}), hay: "", startMs: start, endMs: end });
  const list = [
    ix("allday", at(9), at(17)),
    ix("a", at(10), at(10, 30)),
    ix("b", at(11), at(11, 30)),
    ix("c", at(11, 15), at(11, 45)),
    ix("d", at(12), at(12, 30)),
  ];
  it("picks the earliest recently started live session", () => {
    expect(nowAnchor(list, at(11, 20))?.s.id).toBe("b");
  });
  it("between slots, picks the next one rather than an all-day item", () => {
    expect(nowAnchor(list, at(11, 50))?.s.id).toBe("d");
  });
  it("before everything, picks the first", () => {
    expect(nowAnchor(list, at(8))?.s.id).toBe("allday");
  });
  it("after the last start, falls back to a live one or null", () => {
    expect(nowAnchor(list, at(12, 10))?.s.id).toBe("d");
    expect(nowAnchor(list, at(18))).toBeNull();
  });
});
