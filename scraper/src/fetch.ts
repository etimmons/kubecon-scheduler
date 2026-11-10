import type { EventConfig, ScheduleFile } from "../../shared/types.ts";
import { parseSessionize, sourceHash, type SzAll } from "./parse.ts";

export function sessionizeUrl(cfg: EventConfig): string {
  return `https://sessionize.com/api/v2/${cfg.sessionizeApiCode}/view/All`;
}

/** One fetch of the source per run. */
export async function fetchSchedule(cfg: EventConfig, fetchImpl: typeof fetch = fetch): Promise<ScheduleFile> {
  const res = await fetchImpl(sessionizeUrl(cfg), {
    headers: { accept: "application/json", "user-agent": "kubecon-scheduler/0.1" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sessionize ${res.status} ${res.statusText}`);
  const raw = await res.text();
  const data = JSON.parse(raw) as SzAll;
  if (!Array.isArray(data.sessions)) throw new Error("Sessionize response has no sessions array");
  return parseSessionize(data, cfg, { hash: sourceHash(raw) });
}

export type GuardResult = { ok: true } | { ok: false; reason: string };

/** Never replace a live schedule with one holding fewer than 80% of its sessions. */
export function guardReplacement(prev: ScheduleFile | null, next: ScheduleFile): GuardResult {
  if (next.sessions.length === 0) return { ok: false, reason: "new schedule has no sessions" };
  if (!prev) return { ok: true };
  const min = Math.ceil(prev.sessions.length * 0.8);
  if (next.sessions.length < min) {
    return { ok: false, reason: `new schedule has ${next.sessions.length} sessions, below 80% of ${prev.sessions.length}` };
  }
  return { ok: true };
}
