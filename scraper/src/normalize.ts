import type { Session } from "../../shared/types.ts";

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  "#39": "'",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Collapse runs of spaces/tabs and trim. */
export function collapse(s: string | null | undefined): string {
  return decodeEntities(s ?? "").replace(/[ \t ]+/g, " ").trim();
}

/** Plain text with paragraphs kept: CRLF -> LF, trailing spaces trimmed, 3+ newlines -> 2. */
export function paragraphs(s: string | null | undefined): string {
  return decodeEntities(s ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Undo spreadsheet-style quoting: '"He said ""hi"""' -> 'He said "hi"'. Only when the whole text is wrapped. */
export function unquote(s: string): string {
  if (s.length >= 2 && s.startsWith('"') && s.includes('""')) {
    const end = s.endsWith('"') && !s.endsWith('""') ? s.length - 1 : s.endsWith('"""') ? s.length - 1 : s.length;
    return s.slice(1, end).replace(/""/g, '"').trim();
  }
  return s;
}

// The LF data-sharing disclosure appended to sponsored sessions, usually wrapped in _italics_.
const SPONSOR_DISCLOSURE =
  /_?\s*In order to facilitate networking and business relationships at the event[\s\S]*?(?:own privacy policies\.?|$)\s*_?/i;

/** Strip the sponsor data-sharing disclosure. Returns the cleaned text and whether it was present. */
export function stripSponsorDisclosure(abstract: string): { text: string; sponsored: boolean } {
  if (!SPONSOR_DISCLOSURE.test(abstract)) return { text: abstract, sponsored: false };
  return { text: abstract.replace(SPONSOR_DISCLOSURE, "").trim(), sponsored: true };
}

/** "Salt Palace | Level 1 | Hall DE" -> path/venue/level/room. */
export function parseLocation(name: string): Session["location"] {
  const path = collapse(name)
    .split("|")
    .map((p) => p.trim())
    .filter(Boolean);
  if (path.length === 0) return { path: ["TBD"], venue: "TBD", room: "TBD" };
  const level = path.find((p) => /^Level \d/i.test(p));
  return { path, venue: path[0], ...(level ? { level } : {}), room: path[path.length - 1] };
}
