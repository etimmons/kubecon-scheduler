// Types shared by scraper, server and app.

export interface EventConfig {
  id: string;
  name: string;
  timeZone: string; // IANA zone, e.g. America/Denver
  sourceUrl: string; // human-facing schedule page
  sessionizeApiCode: string; // https://sessionize.com/api/v2/{code}/view/All
  dates: string[]; // YYYY-MM-DD, event-local
  /** Category groups (Sessionize category titles) to expose as facets, in display order. */
  facetGroups: { title: string; key: string; label?: string; colors?: boolean }[];
  /** Chip colours by category item name (from the LF page's primaryColorOverrides). */
  colors: Record<string, string>;
}

export interface FacetValue {
  name: string; // display name, e.g. "⚡ Lightning Talks"
  slug: string; // URL value, LF-compatible, e.g. "lightning-talks"
  color?: string;
}

export interface FacetDef {
  key: string; // URL parameter, LF-compatible, e.g. "all-sessions"
  label: string; // UI label
  values: FacetValue[]; // in source order
}

export interface ScheduleFile {
  schemaVersion: 1;
  event: { id: string; name: string; timeZone: string; sourceUrl: string };
  scrapedAt: string; // ISO 8601, UTC
  sourceHash: string; // sha256 of the fetched source, to skip no-op writes
  facets: FacetDef[];
  sessions: Session[];
}

export interface Speaker {
  name: string;
  title?: string;
  company?: string;
}

export interface Session {
  id: string;
  title: string;
  start: string; // ISO 8601 with offset, e.g. 2026-11-10T11:30:00-07:00
  end: string;
  location: {
    path: string[];
    venue: string;
    level?: string;
    room: string;
  };
  speakers: Speaker[];
  speakerLine?: string; // display override from the source ("Speaker Name Display")
  abstract: string;
  /** Facet key -> value slugs. Empty array when absent. */
  facets: Record<string, string[]>;
  links: { label: string; url: string }[];
}

export interface StarSnapshot {
  title: string;
  start: string;
  end: string;
  room: string;
}

// localStorage key: `stars:${event.id}`
export interface StarRecord {
  id: string;
  starred: boolean; // false = unstarred, kept so the unstar syncs
  updatedAt: string; // merge: latest updatedAt per id wins
  snapshot: StarSnapshot;
  /** Set when a refresh found time/room changed; holds the previous values until dismissed. Local-only. */
  changedFrom?: StarSnapshot;
}

/** Facet keys the normalizer always produces, beyond the configured category groups. */
export const DERIVED_FACETS = {
  date: "date",
  location: "location",
  slides: "slides",
} as const;
