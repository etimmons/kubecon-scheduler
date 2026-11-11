import { createHash } from "node:crypto";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type { EventConfig, ScheduleFile } from "../../shared/types.ts";
import { eventDate } from "../../shared/time.ts";
import { fetchSchedule, guardReplacement } from "../../scraper/src/fetch.ts";
import { readJson, writeAtomic } from "./store.ts";

export interface Served {
  file: ScheduleFile;
  body: Buffer;
  gz: Buffer;
  etag: string;
}

export interface RefreshStatus {
  lastAttempt?: string;
  lastSuccess?: string;
  lastChange?: string;
  lastError?: string;
  sessions?: number;
}

const THIRTY_MIN = 30 * 60_000;
const DAY = 24 * 60 * 60_000;

/** Scrape every 30 min on event days (and the day before), daily otherwise. */
export function nextInterval(cfg: EventConfig, now = Date.now()): number {
  const today = eventDate(now, cfg.timeZone);
  const tomorrow = eventDate(now + DAY, cfg.timeZone);
  return cfg.dates.includes(today) || cfg.dates.includes(tomorrow) ? THIRTY_MIN : DAY;
}

function serve(file: ScheduleFile): Served {
  const body = Buffer.from(JSON.stringify(file));
  const etag = `"${createHash("sha1").update(body).digest("base64url")}"`;
  return { file, body, gz: gzipSync(body, { level: 9 }), etag };
}

export class ScheduleKeeper {
  current: Served | null = null;
  status: RefreshStatus = {};
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<RefreshStatus> | null = null;

  private cfg: EventConfig;
  private dir: string;
  private seedPath: string | null;
  private fetchImpl: typeof fetch;
  private log: (msg: string) => void;

  constructor(
    cfg: EventConfig,
    dir: string,
    seedPath: string | null,
    fetchImpl: typeof fetch = fetch,
    log: (msg: string) => void = (m) => console.log(m),
  ) {
    this.cfg = cfg;
    this.dir = dir;
    this.seedPath = seedPath;
    this.fetchImpl = fetchImpl;
    this.log = log;
  }

  private get livePath() {
    return join(this.dir, "schedule.json");
  }
  private get lastGoodPath() {
    return join(this.dir, "schedule.last-good.json");
  }

  /** Load the live file, else the last good copy, else the seed baked into the image. Only this event's. */
  async load(): Promise<void> {
    for (const p of [this.livePath, this.lastGoodPath, this.seedPath]) {
      if (!p) continue;
      const f = await readJson<ScheduleFile>(p);
      if (f?.schemaVersion === 1 && f.event?.id === this.cfg.id && Array.isArray(f.sessions) && f.sessions.length) {
        this.current = serve(f);
        this.status.sessions = f.sessions.length;
        this.log(`schedule: loaded ${f.sessions.length} sessions from ${p}`);
        return;
      }
    }
    this.log("schedule: nothing to load yet");
  }

  /** One scrape. Never replaces the live schedule with a bad or much smaller one. */
  refresh(): Promise<RefreshStatus> {
    this.running ??= this.doRefresh().finally(() => (this.running = null));
    return this.running;
  }

  private async doRefresh(): Promise<RefreshStatus> {
    const now = new Date().toISOString();
    this.status.lastAttempt = now;
    try {
      const next = await fetchSchedule(this.cfg, this.fetchImpl);
      const prev = this.current?.file ?? null;
      const g = guardReplacement(prev, next);
      if (!g.ok) throw new Error(`refused: ${g.reason}`);
      this.status.lastSuccess = now;
      this.status.lastError = undefined;
      if (prev && prev.sourceHash === next.sourceHash) {
        this.log("schedule: unchanged");
        return { ...this.status };
      }
      const served = serve(next);
      await writeAtomic(this.livePath, served.body);
      await writeAtomic(this.lastGoodPath, served.body);
      this.current = served;
      this.status.lastChange = now;
      this.status.sessions = next.sessions.length;
      this.log(`schedule: updated, ${next.sessions.length} sessions`);
    } catch (e) {
      this.status.lastError = String(e instanceof Error ? e.message : e);
      this.log(`schedule: refresh failed, keeping last good copy: ${this.status.lastError}`);
    }
    return { ...this.status };
  }

  start(): void {
    const tick = async () => {
      await this.refresh();
      this.timer = setTimeout(tick, nextInterval(this.cfg));
      this.timer.unref?.();
    };
    void tick();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
