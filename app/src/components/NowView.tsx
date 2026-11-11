import { useMemo } from "preact/hooks";
import { dayLabel, eventDate, timeLabel, zoneAbbr } from "../../../shared/time.ts";
import type { Indexed } from "../filters/filter.ts";
import { facetLookup } from "../format.ts";
import { isStarred } from "../state/stars.ts";
import { openDetail, setNowStarredOnly, type AppState } from "../state/store.ts";
import { SessionRow } from "./SessionRow.tsx";

const SOON_MS = 30 * 60_000;

/** In progress now, and starting within 30 minutes; starred first, then by time. */
export function nowAndNext(items: Indexed[], nowMs: number, starred: (id: string) => boolean) {
  const order = (a: Indexed, b: Indexed) =>
    Number(starred(b.s.id)) - Number(starred(a.s.id)) || a.startMs - b.startMs || a.endMs - b.endMs;
  const live = items.filter((i) => i.startMs <= nowMs && nowMs < i.endMs).sort(order);
  const soon = items.filter((i) => i.startMs > nowMs && i.startMs <= nowMs + SOON_MS).sort(order);
  return { live, soon };
}

export function NowView({ app }: { app: AppState }) {
  const tz = app.schedule!.event.timeZone;
  const lookup = useMemo(() => facetLookup(app.schedule!.facets), [app.schedule]);
  const star = (id: string) => isStarred(app.stars, id);
  const only = app.nowStarredOnly;
  const pool = only ? app.items.filter((i) => star(i.s.id)) : app.items;
  const { live, soon } = nowAndNext(pool, app.nowMs, star);
  const next = live.length || soon.length ? null : pool.find((i) => i.startMs > app.nowMs);
  // When filtered to starred and nothing is on, say how much the full list would show.
  const allCount = only && !live.length && !soon.length ? Object.values(nowAndNext(app.items, app.nowMs, star)).flat().length : 0;
  const ids = [...live, ...soon].map((i) => i.s.id);
  const nowIso = new Date(app.nowMs).toISOString();

  const section = (title: string, list: Indexed[]) =>
    list.length > 0 && (
      <section aria-label={title}>
        <h2 class="day-head">
          {title} <span class="dim">· {list.length}</span>
        </h2>
        <ul class="rows">
          {list.map((ix) => (
            <SessionRow
              key={ix.s.id}
              ix={ix}
              tz={tz}
              lookup={lookup}
              starred={star(ix.s.id)}
              nowMs={app.nowMs}
              onOpen={(id) => openDetail(id, ids)}
            />
          ))}
        </ul>
      </section>
    );

  return (
    <div class="view">
      <div class="summary now-bar">
        <span>
          Venue time {timeLabel(nowIso, tz)} {zoneAbbr(app.nowMs, tz)}
        </span>
        <div class="seg" role="group" aria-label="Show">
          <button type="button" class={only ? "" : "on"} aria-pressed={!only} onClick={() => setNowStarredOnly(false)}>
            All
          </button>
          <button type="button" class={only ? "on" : ""} aria-pressed={only} onClick={() => setNowStarredOnly(true)}>
            ★ Starred
          </button>
        </div>
      </div>
      {section("In progress", live)}
      {section("Starting within 30 min", soon)}
      {!live.length && !soon.length && (
        <div class="empty">
          <p>{only ? "None of your starred sessions are on right now." : "Nothing running right now."}</p>
          {next && (
            <p class="dim">
              Next{only ? " starred" : " up"}: {next.s.title} at {timeLabel(next.s.start, tz)}
              {eventDate(next.s.start, tz) !== eventDate(app.nowMs, tz) && ` on ${dayLabel(eventDate(next.s.start, tz))}`}
            </p>
          )}
          {allCount > 0 && (
            <button type="button" class="btn" onClick={() => setNowStarredOnly(false)}>
              Show all {allCount} on now or soon
            </button>
          )}
        </div>
      )}
    </div>
  );
}
