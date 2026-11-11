import { slug } from "../../../shared/slug.ts";
import { dayLabel, eventDate } from "../../../shared/time.ts";
import type { Indexed } from "../filters/filter.ts";
import { dayTime, fullWhen } from "../format.ts";
import { orphans, overlaps } from "../state/stars.ts";
import { dismiss, navigate, openDetail, type AppState } from "../state/store.ts";
import { GroupedList, hasNowAnchor, jumpToNow } from "./ScheduleView.tsx";
import { StarButton } from "./StarButton.tsx";

export function MySchedule({ app }: { app: AppState }) {
  const tz = app.schedule!.event.timeZone;
  const daySlug = (iso: string) => slug(dayLabel(eventDate(iso, tz)));
  const allStarred: Indexed[] = Object.values(app.stars)
    .filter((r) => r.starred)
    .map((r) => app.ixById.get(r.id))
    .filter((x): x is Indexed => !!x)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const allGone = orphans(app.stars, app.byId);

  // Day tabs: only days that have something starred, with counts. Keyed by YYYY-MM-DD so they sort.
  const days = new Map<string, { slug: string; label: string; count: number }>();
  for (const iso of [...allStarred.map((i) => i.s.start), ...allGone.map((r) => r.snapshot.start)]) {
    const ymd = eventDate(iso, tz);
    const d = days.get(ymd) ?? { slug: slug(dayLabel(ymd)), label: dayLabel(ymd), count: 0 };
    d.count++;
    days.set(ymd, d);
  }
  const sortedDays = [...days.keys()].sort().map((k) => days.get(k)!);
  // No explicit choice: today's tab if today has anything starred, else All.
  // An unknown or now-empty day also falls back to All.
  const wanted = app.route.day ?? daySlug(new Date(app.nowMs).toISOString());
  const day = wanted !== "all" && sortedDays.some((d) => d.slug === wanted) ? wanted : null;
  const onDay = (iso: string) => !day || daySlug(iso) === day;

  const starred = allStarred.filter((i) => onDay(i.s.start));
  const gone = allGone.filter((r) => onDay(r.snapshot.start));
  // Overlaps only happen within a day, so flagging against all stars is the same as per day.
  const clash = overlaps(allStarred.map((i) => ({ id: i.s.id, startMs: i.startMs, endMs: i.endMs })));
  const changed = starred.filter((i) => app.stars[i.s.id]?.changedFrom);
  const ids = starred.map((i) => i.s.id);
  const canJump = hasNowAnchor(starred, app.nowMs);
  const badges = new Map<string, string>();
  for (const ix of starred) {
    const b = app.stars[ix.s.id]?.changedFrom ? "Changed" : clash.has(ix.s.id) ? "Overlaps" : undefined;
    if (b) badges.set(ix.s.id, b);
  }

  if (!allStarred.length && !allGone.length) {
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
      {sortedDays.length > 0 && (
        <nav class="days mine-days" aria-label="Day">
          <button type="button" class={day === null ? "on" : ""} aria-pressed={day === null} onClick={() => navigate({ day: "all" })}>
            All
            <small>{allStarred.length + allGone.length}</small>
          </button>
          {sortedDays.map((d) => (
            <button key={d.slug} type="button" class={day === d.slug ? "on" : ""} aria-pressed={day === d.slug} onClick={() => navigate({ day: d.slug })}>
              {d.label.split(" ")[0]}
              <small>
                {d.label.split(" ").slice(1).join(" ")} · {d.count}
              </small>
            </button>
          ))}
        </nav>
      )}
      {canJump && (
        <p class="summary">
          <button type="button" class="link" onClick={() => jumpToNow()}>
            Jump to now
          </button>
        </p>
      )}
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
      {starred.length > 0 && <GroupedList list={starred} app={app} context={ids} badges={badges} dayCounts />}
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
