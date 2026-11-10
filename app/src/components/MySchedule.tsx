import { useMemo } from "preact/hooks";
import { dayLabel, eventDate } from "../../../shared/time.ts";
import type { Indexed } from "../filters/filter.ts";
import { dayTime, facetLookup, fullWhen } from "../format.ts";
import { orphans, overlaps } from "../state/stars.ts";
import { dismiss, openDetail, type AppState } from "../state/store.ts";
import { SessionRow } from "./SessionRow.tsx";
import { StarButton } from "./StarButton.tsx";

export function MySchedule({ app }: { app: AppState }) {
  const tz = app.schedule!.event.timeZone;
  const lookup = useMemo(() => facetLookup(app.schedule!.facets), [app.schedule]);
  const starred: Indexed[] = Object.values(app.stars)
    .filter((r) => r.starred)
    .map((r) => app.ixById.get(r.id))
    .filter((x): x is Indexed => !!x)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const clash = overlaps(starred.map((i) => ({ id: i.s.id, startMs: i.startMs, endMs: i.endMs })));
  const changed = starred.filter((i) => app.stars[i.s.id]?.changedFrom);
  const gone = orphans(app.stars, app.byId);
  const ids = starred.map((i) => i.s.id);

  const byDay = new Map<string, Indexed[]>();
  for (const ix of starred) {
    const d = eventDate(ix.s.start, tz);
    byDay.set(d, [...(byDay.get(d) ?? []), ix]);
  }

  if (!starred.length && !gone.length) {
    return (
      <div class="view">
        <div class="empty">
          <p>No starred sessions yet.</p>
          <p class="dim">Tap the star on any session to add it here.</p>
        </div>
      </div>
    );
  }

  return (
    <div class="view">
      {changed.length > 0 && (
        <section class="notice-group" aria-label="Changed">
          <h2 class="day-head warn-text">Changed</h2>
          <ul class="rows">
            {changed.map((ix) => {
              const was = app.stars[ix.s.id].changedFrom!;
              return (
                <li key={ix.s.id} class="row changed">
                  <button type="button" class="row-main" onClick={() => openDetail(ix.s.id, ids)}>
                    <span class="row-title">{ix.s.title}</span>
                    <span class="row-l3">
                      Now {fullWhen(ix.s, tz)}, {ix.s.location.room}
                    </span>
                    <span class="row-l3 strike">
                      Was {fullWhen(was, tz)}, {was.room}
                    </span>
                  </button>
                  <button type="button" class="btn small" onClick={() => dismiss(ix.s.id)}>
                    Dismiss
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {[...byDay.entries()].map(([day, list]) => (
        <section key={day} aria-label={dayLabel(day)}>
          <h2 class="day-head">
            {dayLabel(day)} <span class="dim">· {list.length}</span>
          </h2>
          <ul class="rows">
            {list.map((ix) => (
              <SessionRow
                key={ix.s.id}
                ix={ix}
                tz={tz}
                lookup={lookup}
                starred
                nowMs={app.nowMs}
                badge={app.stars[ix.s.id]?.changedFrom ? "Changed" : clash.has(ix.s.id) ? "Overlaps" : undefined}
                onOpen={(id) => openDetail(id, ids)}
              />
            ))}
          </ul>
        </section>
      ))}
      {gone.length > 0 && (
        <section aria-label="No longer on the schedule">
          <h2 class="day-head warn-text">No longer on the schedule</h2>
          <ul class="rows">
            {gone.map((r) => (
              <li key={r.id} class="row orphan">
                <div class="row-main">
                  <span class="row-title">{r.snapshot.title}</span>
                  <span class="row-l3">
                    Was {dayTime(r.snapshot.start, tz)}, {r.snapshot.room}
                  </span>
                </div>
                <StarButton id={r.id} starred title={r.snapshot.title} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
