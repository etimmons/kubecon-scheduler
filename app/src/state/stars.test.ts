import { describe, expect, it } from "vitest";
import type { Session, StarRecord } from "../../../shared/types.ts";
import { detectChanges, dismissChange, mergeStars, orphans, overlaps, toggleStar, toMap } from "./stars.ts";

const s = (id: string, start: string, end: string, room = "Hall DE", title = `T${id}`): Session => ({
  id,
  title,
  start,
  end,
  location: { path: ["Salt Palace", room], venue: "Salt Palace", room },
  speakers: [],
  abstract: "",
  facets: {},
  links: [],
});

const A = s("a", "2026-11-11T10:00:00-07:00", "2026-11-11T10:30:00-07:00");
const B = s("b", "2026-11-11T11:00:00-07:00", "2026-11-11T11:30:00-07:00");

describe("toggle and merge", () => {
  it("unstar writes starred:false, not a delete", () => {
    let m = toggleStar({}, A, new Date("2026-11-10T10:00:00Z"));
    expect(m.a.starred).toBe(true);
    m = toggleStar(m, A, new Date("2026-11-10T10:01:00Z"));
    expect(m.a).toMatchObject({ starred: false, updatedAt: "2026-11-10T10:01:00.000Z" });
  });

  it("latest updatedAt wins per id, so an offline unstar isn't undone by an older star", () => {
    const phone = toggleStar(toggleStar({}, A, new Date("2026-11-10T10:00:00Z")), A, new Date("2026-11-10T12:00:00Z"));
    const ipad: StarRecord[] = [{ id: "a", starred: true, updatedAt: "2026-11-10T10:00:00.000Z", snapshot: phone.a.snapshot }];
    expect(mergeStars(phone, ipad).a.starred).toBe(false);
    // And the other way round: the iPad learns the unstar.
    expect(mergeStars(toMap(ipad), Object.values(phone)).a.starred).toBe(false);
  });

  it("keeps local on ties and preserves local changedFrom", () => {
    const local = toMap([{ id: "a", starred: true, updatedAt: "2026-11-10T10:00:00.000Z", snapshot: { title: "x", start: "1", end: "2", room: "r" }, changedFrom: { title: "x", start: "0", end: "1", room: "q" } }]);
    const remote: StarRecord[] = [{ id: "a", starred: false, updatedAt: "2026-11-10T10:00:00.000Z", snapshot: local.a.snapshot }];
    expect(mergeStars(local, remote).a.starred).toBe(true);
    const newer: StarRecord[] = [{ ...remote[0], updatedAt: "2026-11-10T11:00:00.000Z" }];
    const m = mergeStars(local, newer);
    expect(m.a.starred).toBe(false);
    expect(m.a.changedFrom).toEqual(local.a.changedFrom);
  });
});

describe("change detection (F11)", () => {
  const starred = toggleStar(toggleStar({}, A), B);

  it("flags a starred session whose time moved, keeping the old value", () => {
    const moved = s("a", "2026-11-11T14:00:00-07:00", "2026-11-11T14:30:00-07:00");
    const r = detectChanges(starred, new Map([["a", moved], ["b", B]]));
    expect(r.changed).toBe(true);
    expect(r.stars.a.changedFrom).toMatchObject({ start: A.start, room: "Hall DE" });
    expect(r.stars.a.snapshot.start).toBe(moved.start);
    expect(r.stars.a.updatedAt).toBe(starred.a.updatedAt); // doesn't win merges
    expect(r.stars.b.changedFrom).toBeUndefined();
  });

  it("flags a room change", () => {
    const r = detectChanges(starred, new Map([["a", s("a", A.start, A.end, "255 BC")], ["b", B]]));
    expect(r.stars.a.changedFrom?.room).toBe("Hall DE");
  });

  it("keeps the oldest value across repeated moves, clears when dismissed or moved back", () => {
    const m1 = detectChanges(starred, new Map([["a", s("a", A.start, A.end, "Room 2")], ["b", B]])).stars;
    const m2 = detectChanges(m1, new Map([["a", s("a", A.start, A.end, "Room 3")], ["b", B]])).stars;
    expect(m2.a.changedFrom?.room).toBe("Hall DE");
    expect(dismissChange(m2, "a").a.changedFrom).toBeUndefined();
    const back = detectChanges(m2, new Map([["a", A], ["b", B]])).stars;
    expect(back.a.changedFrom).toBeUndefined();
  });

  it("a title-only edit updates the snapshot without a badge", () => {
    const r = detectChanges(starred, new Map([["a", s("a", A.start, A.end, "Hall DE", "New title")], ["b", B]]));
    expect(r.stars.a.snapshot.title).toBe("New title");
    expect(r.stars.a.changedFrom).toBeUndefined();
  });

  it("a starred session missing from the refresh becomes an orphan with its snapshot", () => {
    const byId = new Map([["b", B]]);
    const r = detectChanges(starred, byId);
    expect(r.stars.a).toEqual(starred.a); // never deleted
    expect(orphans(r.stars, byId).map((o) => o.snapshot.title)).toEqual(["Ta"]);
  });

  it("ignores unstarred records", () => {
    const un = toggleStar(starred, A);
    const r = detectChanges(un, new Map([["b", B]]));
    expect(orphans(r.stars, new Map([["b", B]]))).toEqual([]);
  });
});

describe("overlaps", () => {
  it("flags every session that overlaps another, not touching ones", () => {
    const t = (h: number, m = 0) => Date.UTC(2026, 10, 11, h, m);
    const set = overlaps([
      { id: "long", startMs: t(9), endMs: t(12) },
      { id: "inner", startMs: t(10), endMs: t(10, 30) },
      { id: "after", startMs: t(12), endMs: t(13) }, // touches, doesn't overlap
      { id: "alone", startMs: t(14), endMs: t(15) },
    ]);
    expect([...set].sort()).toEqual(["inner", "long"]);
  });
});
