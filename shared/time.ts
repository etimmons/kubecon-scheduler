// All time math happens in the event's zone via Intl, never via Date local getters,
// so a phone set to any zone still shows venue time.

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function parts(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    dtfCache.set(tz, f);
  }
  return f;
}

function zoned(ms: number, tz: string) {
  const o: Record<string, string> = {};
  for (const p of parts(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  return {
    y: +o.year,
    mo: +o.month,
    d: +o.day,
    h: +o.hour,
    mi: +o.minute,
    s: +o.second,
  };
}

/** Offset of `tz` from UTC at instant `ms`, in minutes (MST = -420). */
export function offsetMinutes(ms: number, tz: string): number {
  const z = zoned(ms, tz);
  const asUtc = Date.UTC(z.y, z.mo - 1, z.d, z.h, z.mi, z.s);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

function fmtOffset(min: number): string {
  const sign = min < 0 ? "-" : "+";
  const a = Math.abs(min);
  return `${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

/** "2026-11-10T11:30:00" (wall time in tz) -> "2026-11-10T11:30:00-07:00". */
export function localToIso(local: string, tz: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(local);
  if (!m) throw new Error(`bad local time: ${local}`);
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  let off = offsetMinutes(wall, tz);
  off = offsetMinutes(wall - off * 60000, tz); // second pass settles DST edges
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${fmtOffset(off)}`;
}

/** Event-local calendar date "YYYY-MM-DD" for an ISO instant. */
export function eventDate(iso: string | number, tz: string): string {
  const z = zoned(typeof iso === "number" ? iso : Date.parse(iso), tz);
  return `${z.y}-${String(z.mo).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-11" -> "Wed Nov 11" (the LF page's Date filter label; slug "wed-nov-11"). */
export function dayLabel(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WD[wd]} ${MO[m - 1]} ${d}`;
}

/** "11:30 AM" in the event zone. */
export function timeLabel(iso: string, tz: string): string {
  const z = zoned(Date.parse(iso), tz);
  const h12 = z.h % 12 === 0 ? 12 : z.h % 12;
  return `${h12}:${String(z.mi).padStart(2, "0")} ${z.h < 12 ? "AM" : "PM"}`;
}

/** Short zone label, e.g. "MST". */
export function zoneAbbr(ms: number, tz: string): string {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date(ms))
    .find((x) => x.type === "timeZoneName");
  return p?.value ?? tz;
}
