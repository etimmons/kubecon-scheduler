import type { FacetDef, Session } from "../../shared/types.ts";
import { dayLabel, eventDate, timeLabel, zoneAbbr } from "../../shared/time.ts";

export function timeRange(start: string, end: string, tz: string): string {
  return `${timeLabel(start, tz)} – ${timeLabel(end, tz)}`;
}

export function dayTime(iso: string, tz: string): string {
  return `${dayLabel(eventDate(iso, tz))} · ${timeLabel(iso, tz)}`;
}

export function fullWhen(s: { start: string; end: string }, tz: string): string {
  return `${dayLabel(eventDate(s.start, tz))} · ${timeRange(s.start, s.end, tz)} ${zoneAbbr(Date.parse(s.start), tz)}`;
}

export function speakerSummary(s: Session): string {
  if (s.speakerLine) return s.speakerLine;
  if (!s.speakers.length) return "";
  const first = s.speakers[0];
  const who = first.company ? `${first.name}, ${first.company}` : first.name;
  return s.speakers.length > 1 ? `${who} +${s.speakers.length - 1}` : who;
}

export interface FacetLookup {
  name(key: string, slug: string): string;
  color(key: string, slug: string): string | undefined;
  def(key: string): FacetDef | undefined;
}

export function facetLookup(facets: FacetDef[]): FacetLookup {
  const m = new Map<string, Map<string, { name: string; color?: string }>>();
  for (const f of facets) m.set(f.key, new Map(f.values.map((v) => [v.slug, v])));
  const defs = new Map(facets.map((f) => [f.key, f]));
  return {
    name: (k, s) => m.get(k)?.get(s)?.name ?? s,
    color: (k, s) => m.get(k)?.get(s)?.color,
    def: (k) => defs.get(k),
  };
}

/** Readable text colour on a chip background. */
export function chipStyle(color: string | undefined): Record<string, string> | undefined {
  if (!color) return undefined;
  return { "--chip": color } as Record<string, string>;
}
