import { createHash } from "node:crypto";
import type { EventConfig, FacetDef, ScheduleFile, Session, Speaker } from "../../shared/types.ts";
import { slug } from "../../shared/slug.ts";
import { dayLabel, eventDate, localToIso } from "../../shared/time.ts";
import { assignIds } from "./ids.ts";
import { collapse, paragraphs, parseLocation, stripSponsorDisclosure, unquote } from "./normalize.ts";

// Subset of the Sessionize API v2 "All" view that we use.
export interface SzAll {
  sessions: SzSession[];
  speakers: SzSpeaker[];
  questions: { id: number; question: string }[];
  categories: { id: number; title: string; items: { id: number; name: string; sort: number }[]; sort: number }[];
  rooms: { id: number; name: string; sort: number }[];
}
interface SzAnswer {
  questionId: number;
  answerValue: string | null;
}
interface SzSession {
  id: string;
  title: string;
  description: string | null;
  startsAt: string | null;
  endsAt: string | null;
  speakers: string[];
  categoryItems: number[];
  questionAnswers: SzAnswer[];
  roomId: number | null;
  liveUrl: string | null;
  recordingUrl: string | null;
  status?: string | null;
}
interface SzSpeaker {
  id: string;
  fullName: string;
  tagLine?: string | null;
  questionAnswers: SzAnswer[];
}

const LINK_QUESTIONS: [string, string][] = [
  ["Presentation Slides", "Slides"],
  ["GitHub Repository", "GitHub"],
  ["Project Demo", "Demo"],
  ["Website", "Website"],
  ["Location Map", "Map"],
];

export function sourceHash(raw: string | Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function parseSessionize(data: SzAll, cfg: EventConfig, opts: { hash: string; now?: Date }): ScheduleFile {
  const tz = cfg.timeZone;
  const qByName = new Map(data.questions.map((q) => [q.question, q.id]));
  const answer = (answers: SzAnswer[], name: string): string | undefined => {
    const id = qByName.get(name);
    const v = answers.find((a) => a.questionId === id)?.answerValue;
    return v ? collapse(v) : undefined;
  };

  // Category groups -> facets. Item IDs map to (facet key, slug).
  const itemToFacet = new Map<number, { key: string; slug: string }>();
  const facets: FacetDef[] = [];
  for (const g of cfg.facetGroups) {
    const cat = data.categories.find((c) => c.title === g.title);
    if (!cat) continue;
    const items = [...cat.items].sort((a, b) => a.sort - b.sort);
    facets.push({
      key: g.key,
      label: g.label ?? g.title,
      values: items.map((it) => ({
        name: collapse(it.name),
        slug: slug(it.name),
        ...(g.colors && cfg.colors[it.name] ? { color: cfg.colors[it.name] } : {}),
      })),
    });
    for (const it of items) itemToFacet.set(it.id, { key: g.key, slug: slug(it.name) });
  }

  const rooms = new Map(data.rooms.map((r) => [r.id, r]));
  const speakers = new Map(data.speakers.map((s) => [s.id, s]));

  const toSpeaker = (sp: SzSpeaker): Speaker => {
    const company = answer(sp.questionAnswers, "Company Override") ?? answer(sp.questionAnswers, "Company");
    const title = answer(sp.questionAnswers, "Speaker Title");
    return { name: collapse(sp.fullName), ...(title ? { title } : {}), ...(company ? { company } : {}) };
  };

  const pre = data.sessions
    .filter((s) => s.startsAt && s.endsAt && (s.status ?? "Accepted") === "Accepted")
    .map((s) => {
      const start = localToIso(s.startsAt!, tz);
      const end = localToIso(s.endsAt!, tz);
      const day = eventDate(start, tz);
      const sessionFacets: Record<string, string[]> = {};
      for (const f of facets) sessionFacets[f.key] = [];
      for (const ci of s.categoryItems) {
        const m = itemToFacet.get(ci);
        if (m && !sessionFacets[m.key].includes(m.slug)) sessionFacets[m.key].push(m.slug);
      }
      const stripped = stripSponsorDisclosure(paragraphs(s.description));
      const abstract = unquote(stripped.text);
      const sponsored = stripped.sponsored;
      if (sponsored && sessionFacets.sponsored && !sessionFacets.sponsored.includes("sponsored")) {
        sessionFacets.sponsored.push("sponsored");
      }
      const room = s.roomId != null ? rooms.get(s.roomId) : undefined;
      const location = parseLocation(room?.name ?? "TBD");
      const links: Session["links"] = [];
      for (const [q, label] of LINK_QUESTIONS) {
        const url = answer(s.questionAnswers, q);
        if (url && /^https?:\/\//.test(url)) links.push({ label, url });
      }
      if (s.liveUrl) links.push({ label: "Live", url: s.liveUrl });
      if (s.recordingUrl) links.push({ label: "Recording", url: s.recordingUrl });
      sessionFacets.date = [slug(dayLabel(day))];
      sessionFacets.venue = [slug(location.venue)];
      sessionFacets.location = [slug(location.path.join(" "))];
      sessionFacets.slides = links.some((l) => l.label === "Slides") ? ["uploaded"] : [];
      const speakerLine = answer(s.questionAnswers, "Speaker Name Display");
      return {
        sourceId: s.id,
        title: collapse(s.title),
        day,
        start,
        end,
        location,
        speakers: s.speakers.map((id) => speakers.get(id)).filter((x): x is SzSpeaker => !!x).map(toSpeaker),
        ...(speakerLine ? { speakerLine } : {}),
        abstract,
        facets: sessionFacets,
        links,
      };
    });

  const sessions: Session[] = assignIds(pre)
    .map(({ sourceId: _s, day: _d, ...rest }) => rest)
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end) || a.title.localeCompare(b.title));

  // Derived facets, from the data.
  const days = [...new Set(sessions.map((s) => eventDate(s.start, tz)))].sort();
  facets.push({
    key: "date",
    label: "Date",
    values: days.map((d) => ({ name: dayLabel(d), slug: slug(dayLabel(d)) })),
  });
  const venues = new Map<string, number>();
  for (const s of sessions) venues.set(s.location.venue, (venues.get(s.location.venue) ?? 0) + 1);
  facets.push({
    key: "venue",
    label: "Venue",
    values: [...venues.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => ({ name: v, slug: slug(v) })),
  });
  const roomPaths = new Map<string, string[]>();
  for (const s of sessions) roomPaths.set(slug(s.location.path.join(" ")), s.location.path);
  facets.push({
    key: "location",
    label: "Room",
    values: [...roomPaths.entries()]
      .sort((a, b) => a[1].join(" ").localeCompare(b[1].join(" ")))
      .map(([sl, path]) => ({ name: path.length > 1 ? `${path[0]} › ${path[path.length - 1]}` : path[0], slug: sl })),
  });
  facets.push({ key: "slides", label: "Slides", values: [{ name: "Slides available", slug: "uploaded" }] });

  return {
    schemaVersion: 1,
    event: { id: cfg.id, name: cfg.name, timeZone: tz, sourceUrl: cfg.sourceUrl },
    scrapedAt: (opts.now ?? new Date()).toISOString(),
    sourceHash: opts.hash,
    facets,
    sessions,
  };
}
