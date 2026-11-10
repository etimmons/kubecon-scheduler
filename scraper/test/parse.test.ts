import { describe, expect, it } from "vitest";
import { assignIds, contentId } from "../src/ids.ts";
import { guardReplacement } from "../src/fetch.ts";
import { parseLocation, stripSponsorDisclosure, unquote } from "../src/normalize.ts";
import { localToIso } from "../../shared/time.ts";
import { parsedFixture } from "./load.ts";

const schedule = parsedFixture();
const byId = (id: string) => {
  const s = schedule.sessions.find((x) => x.id === id);
  if (!s) throw new Error(`missing ${id}`);
  return s;
};

describe("fixture parse", () => {
  it("keeps all 601 accepted sessions with start < end", () => {
    expect(schedule.sessions).toHaveLength(601);
    for (const s of schedule.sessions) expect(Date.parse(s.start)).toBeLessThan(Date.parse(s.end));
  });

  it("matches the raw per-day counts (counted from the source feed)", () => {
    const count = (d: string) => schedule.sessions.filter((s) => s.facets.date[0] === d).length;
    expect(count("tue-nov-10")).toBe(194);
    expect(count("wed-nov-11")).toBe(204);
    expect(count("thu-nov-12")).toBe(121);
  });

  it("uses unique, stable Sessionize IDs", () => {
    const ids = new Set(schedule.sessions.map((s) => s.id));
    expect(ids.size).toBe(schedule.sessions.length);
    expect([...ids].every((id) => /^\d+$/.test(id))).toBe(true);
  });

  it("derives facets from the data, with LF slugs and colours", () => {
    const cat = schedule.facets.find((f) => f.key === "all-sessions")!;
    expect(cat.values).toHaveLength(30);
    expect(cat.values.find((v) => v.slug === "lightning-talks")).toMatchObject({ name: "⚡ Lightning Talks", color: "#d9d026" });
    expect(cat.values.find((v) => v.slug === "data-processing-plus-storage")).toBeTruthy();
    const date = schedule.facets.find((f) => f.key === "date")!;
    expect(date.values.map((v) => v.slug)).toEqual(["sun-nov-8", "mon-nov-9", "tue-nov-10", "wed-nov-11", "thu-nov-12"]);
  });

  it("keynote: multiple speakers with title and company, MST offset", () => {
    const s = byId("1367757");
    expect(s.title).toBe("Agent Substrate: Open Layers for Agentic Systems");
    expect(s.start).toBe("2026-11-10T09:33:00-07:00");
    expect(s.end).toBe("2026-11-10T09:40:00-07:00");
    expect(s.location).toEqual({ path: ["Salt Palace", "Level 1", "Hall DE"], venue: "Salt Palace", level: "Level 1", room: "Hall DE" });
    expect(s.speakers).toHaveLength(5);
    expect(s.speakers[0]).toEqual({ name: "Jaana Dogan", title: "Software Engineer", company: "Google" });
    expect(s.facets["all-sessions"]).toEqual(["keynote-sessions"]);
  });

  it("lightning talk: audience, subtopic, slides and GitHub links", () => {
    const s = byId("1234985");
    expect(s.start).toBe("2026-11-11T14:34:00-07:00");
    expect(s.location.room).toBe("Regency Ballroom CD");
    expect(s.facets["all-sessions"]).toEqual(["lightning-talks"]);
    expect(s.facets["audience-level"]).toEqual(["any-level"]);
    expect(s.facets.subtopic).toEqual(["operations-plus-performance"]);
    expect(s.facets.slides).toEqual(["uploaded"]);
    expect(s.links.map((l) => l.label)).toEqual(["Slides", "GitHub"]);
    expect(s.speakers[0]).toMatchObject({ name: "Dmitry Shmulevich", company: "NVIDIA" });
  });

  it("co-located event: no speakers, website link, Monday", () => {
    const s = byId("1289762");
    expect(s.title).toBe("FluxCon Hosted by CNCF - Half Day Event | ALL ACCESS PASS REQUIRED");
    expect(s.speakers).toEqual([]);
    expect(s.facets.date).toEqual(["mon-nov-9"]);
    expect(s.facets["all-sessions"]).toEqual(["cncf-hosted-co-located-events"]);
    expect(s.links).toEqual([
      { label: "Website", url: "https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/co-located-events/fluxcon/" },
    ]);
  });

  it("sponsored demo: 6-part location, disclosure stripped, tagged Sponsored, quotes unwrapped", () => {
    const s = byId("1361484");
    expect(s.location.path).toHaveLength(6);
    expect(s.location.room).toBe("Demo Theater");
    expect(s.location.level).toBe("Level 1");
    expect(s.facets.sponsored).toEqual(["sponsored"]);
    expect(s.abstract).not.toMatch(/facilitate networking/);
    expect(s.abstract.startsWith("You wouldn’t serve mystery meat")).toBe(true);
    expect(s.abstract).toContain('like "FROM node:latest" introduces');
  });

  it("tutorial: 80 minutes, advanced", () => {
    const s = byId("1250324");
    expect(Date.parse(s.end) - Date.parse(s.start)).toBe(80 * 60000);
    expect(s.facets["all-sessions"]).toEqual(["tutorials"]);
    expect(s.facets["audience-level"]).toEqual(["advanced"]);
    expect(s.speakers).toHaveLength(5);
  });
});

describe("normalize", () => {
  it("parses short and long locations", () => {
    expect(parseLocation("Room TBD")).toEqual({ path: ["Room TBD"], venue: "Room TBD", room: "Room TBD" });
    expect(parseLocation("Salt Palace | Level 1 | 151 ").room).toBe("151");
  });
  it("strips the sponsor disclosure", () => {
    const r = stripSponsorDisclosure("Hello.\n\n_In order to facilitate networking and business relationships at the event, blah. own privacy policies._");
    expect(r).toEqual({ text: "Hello.", sponsored: true });
  });
  it("unquotes spreadsheet-escaped text", () => {
    expect(unquote('"He said ""hi"" there"')).toBe('He said "hi" there');
    expect(unquote('Plain "quoted" text')).toBe('Plain "quoted" text');
  });
  it("converts wall time to ISO with the zone's offset, including DST", () => {
    expect(localToIso("2026-11-10T11:30:00", "America/Denver")).toBe("2026-11-10T11:30:00-07:00");
    expect(localToIso("2026-07-01T11:30:00", "America/Denver")).toBe("2026-07-01T11:30:00-06:00");
  });
});

describe("ids", () => {
  it("prefers the source ID", () => {
    const [a] = assignIds([{ sourceId: "123", title: "X", day: "2026-11-10", start: "2026-11-10T10:00:00-07:00" }]);
    expect(a.id).toBe("123");
  });
  it("falls back to a 12-hex title+day hash that ignores time and room", () => {
    const id = contentId("  Opening   Remarks ", "2026-11-10");
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(contentId("opening remarks", "2026-11-10")).toBe(id);
    expect(contentId("opening remarks", "2026-11-11")).not.toBe(id);
  });
  it("suffixes collisions -2, -3 in start-time order", () => {
    const items = [
      { title: "Intro", day: "2026-11-10", start: "2026-11-10T15:00:00-07:00" },
      { title: "Intro", day: "2026-11-10", start: "2026-11-10T09:00:00-07:00" },
      { title: "Intro", day: "2026-11-10", start: "2026-11-10T12:00:00-07:00" },
    ];
    const base = contentId("Intro", "2026-11-10");
    expect(assignIds(items).map((x) => x.id)).toEqual([`${base}-3`, base, `${base}-2`]);
  });
});

describe("80% guard", () => {
  it("rejects a refresh that drops below 80% of the previous session count", () => {
    const small = { ...schedule, sessions: schedule.sessions.slice(0, 400) };
    expect(guardReplacement(schedule, small).ok).toBe(false);
    expect(guardReplacement(schedule, { ...schedule, sessions: schedule.sessions.slice(0, 481) }).ok).toBe(true);
    expect(guardReplacement(null, schedule).ok).toBe(true);
    expect(guardReplacement(null, { ...schedule, sessions: [] }).ok).toBe(false);
  });
});
