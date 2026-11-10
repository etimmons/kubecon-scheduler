import { createHash } from "node:crypto";

export function normalizeTitle(t: string): string {
  return t.toLowerCase().normalize("NFKC").replace(/\s+/g, " ").trim();
}

/** Fallback ID when the source has none: sha1(normalized title | day), 12 hex chars. */
export function contentId(title: string, day: string): string {
  return createHash("sha1").update(`${normalizeTitle(title)}|${day}`).digest("hex").slice(0, 12);
}

/**
 * Assign IDs. Source IDs win; otherwise a title+day hash. Time and room are left out
 * on purpose, so a moved session keeps its ID. Collisions get -2, -3 in start order.
 */
export function assignIds<T extends { sourceId?: string | null; title: string; day: string; start: string }>(
  items: T[],
): (T & { id: string })[] {
  const order = items.map((it, i) => ({ it, i })).sort((a, b) => a.it.start.localeCompare(b.it.start) || a.i - b.i);
  const seen = new Map<string, number>();
  const out = new Array<T & { id: string }>(items.length);
  for (const { it, i } of order) {
    const base = it.sourceId ? String(it.sourceId) : contentId(it.title, it.day);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out[i] = { ...it, id: n === 1 ? base : `${base}-${n}` };
  }
  return out;
}
