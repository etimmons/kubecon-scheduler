import type { Session, StarRecord, StarSnapshot } from "../../../shared/types.ts";

export function snapshotOf(s: Session): StarSnapshot {
  return { title: s.title, start: s.start, end: s.end, room: s.location.room };
}

export type StarMap = Record<string, StarRecord>;

export function toMap(list: StarRecord[]): StarMap {
  const m: StarMap = {};
  for (const r of list) m[r.id] = r;
  return m;
}

/**
 * Last-writer-wins per id by updatedAt. On a tie the local record is kept.
 * `changedFrom` is device-local, so it survives whichever side wins.
 */
export function mergeStars(local: StarMap, remote: StarRecord[]): StarMap {
  const out: StarMap = { ...local };
  for (const r of remote) {
    const l = out[r.id];
    if (!l || r.updatedAt > l.updatedAt) {
      const { changedFrom: _ignored, ...clean } = r;
      out[r.id] = l?.changedFrom ? { ...clean, changedFrom: l.changedFrom } : clean;
    }
  }
  return out;
}

export function toggleStar(stars: StarMap, s: Session, now: Date = new Date()): StarMap {
  const cur = stars[s.id];
  const starred = !cur?.starred;
  const rec: StarRecord = { id: s.id, starred, updatedAt: now.toISOString(), snapshot: snapshotOf(s) };
  return { ...stars, [s.id]: rec };
}

export function isStarred(stars: StarMap, id: string): boolean {
  return !!stars[id]?.starred;
}

export function dismissChange(stars: StarMap, id: string): StarMap {
  const r = stars[id];
  if (!r?.changedFrom) return stars;
  const { changedFrom: _c, ...rest } = r;
  return { ...stars, [id]: rest };
}

const moved = (a: StarSnapshot, b: StarSnapshot) => a.start !== b.start || a.end !== b.end || a.room !== b.room;

/**
 * After a schedule load, refresh snapshots of starred sessions. A session whose time or
 * room moved gets `changedFrom` (the oldest undismissed values). Sessions missing from the
 * schedule keep their snapshot and are reported as orphans by `orphans()`.
 * Snapshot refreshes don't bump updatedAt, so they never win a merge over a real edit.
 */
export function detectChanges(stars: StarMap, byId: Map<string, Session>): { stars: StarMap; changed: boolean } {
  let changed = false;
  const out: StarMap = { ...stars };
  for (const r of Object.values(stars)) {
    if (!r.starred) continue;
    const s = byId.get(r.id);
    if (!s) continue;
    const snap = snapshotOf(s);
    if (moved(r.snapshot, snap)) {
      out[r.id] = { ...r, snapshot: snap, changedFrom: r.changedFrom ?? r.snapshot };
      changed = true;
    } else if (r.snapshot.title !== snap.title) {
      out[r.id] = { ...r, snapshot: snap };
      changed = true;
    }
    // A session moved back to where it was: clear the badge.
    const cur = out[r.id];
    if (cur.changedFrom && !moved(cur.changedFrom, snap)) {
      const { changedFrom: _c, ...rest } = cur;
      out[r.id] = rest;
      changed = true;
    }
  }
  return { stars: out, changed };
}

export function orphans(stars: StarMap, byId: Map<string, Session>): StarRecord[] {
  return Object.values(stars)
    .filter((r) => r.starred && !byId.has(r.id))
    .sort((a, b) => a.snapshot.start.localeCompare(b.snapshot.start));
}

/** IDs of starred sessions that overlap another starred session in time (n is small). */
export function overlaps(items: { id: string; startMs: number; endMs: number }[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.startMs < b.endMs && b.startMs < a.endMs) {
        out.add(a.id);
        out.add(b.id);
      }
    }
  }
  return out;
}
