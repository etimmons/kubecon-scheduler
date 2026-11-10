import { join } from "node:path";
import type { StarRecord } from "../../shared/types.ts";
import { readJson, serialized, writeAtomic } from "./store.ts";

interface UserFile {
  events: Record<string, StarRecord[]>;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_RECORDS = 5000;

/** Validate and strip client records down to the stored shape. Invalid entries are dropped. */
export function cleanRecords(input: unknown): StarRecord[] {
  if (!Array.isArray(input)) return [];
  const out: StarRecord[] = [];
  for (const r of input.slice(0, MAX_RECORDS)) {
    if (!r || typeof r !== "object") continue;
    const { id, starred, updatedAt, snapshot } = r as Record<string, unknown>;
    if (typeof id !== "string" || !id || id.length > 64) continue;
    if (typeof starred !== "boolean" || typeof updatedAt !== "string" || !ISO.test(updatedAt)) continue;
    const s = (snapshot ?? {}) as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" ? v.slice(0, 500) : "");
    out.push({
      id,
      starred,
      updatedAt,
      snapshot: { title: str(s.title), start: str(s.start), end: str(s.end), room: str(s.room) },
    });
  }
  return out;
}

/** Last writer wins per id by updatedAt; ties keep the stored record. */
export function mergeLww(stored: StarRecord[], incoming: StarRecord[]): StarRecord[] {
  const m = new Map(stored.map((r) => [r.id, r]));
  for (const r of incoming) {
    const cur = m.get(r.id);
    if (!cur || Date.parse(r.updatedAt) > Date.parse(cur.updatedAt)) m.set(r.id, r);
  }
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function userKey(user: string): string {
  // Usernames become file names: keep a safe subset, and never allow path tricks.
  const k = user.toLowerCase().replace(/[^a-z0-9._@-]/g, "_").replace(/^\.+/, "_");
  return k.slice(0, 128) || "_";
}

const EVENT_ID = /^[a-z0-9-]{1,64}$/;

export class StarStore {
  private dir: string;
  constructor(dir: string) {
    this.dir = dir;
  }

  private path(user: string) {
    return join(this.dir, "stars", `${userKey(user)}.json`);
  }

  async get(user: string, eventId: string): Promise<StarRecord[]> {
    if (!EVENT_ID.test(eventId)) throw new Error("bad event id");
    const f = await readJson<UserFile>(this.path(user));
    return f?.events?.[eventId] ?? [];
  }

  async merge(user: string, eventId: string, incoming: StarRecord[]): Promise<StarRecord[]> {
    if (!EVENT_ID.test(eventId)) throw new Error("bad event id");
    const path = this.path(user);
    return serialized(path, async () => {
      const f = (await readJson<UserFile>(path)) ?? { events: {} };
      const merged = mergeLww(f.events?.[eventId] ?? [], incoming);
      const before = JSON.stringify(f.events?.[eventId] ?? []);
      if (JSON.stringify(merged) !== before) {
        f.events = { ...f.events, [eventId]: merged };
        await writeAtomic(path, JSON.stringify(f));
      }
      return merged;
    });
  }
}
