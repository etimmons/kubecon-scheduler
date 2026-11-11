import { useMemo } from "preact/hooks";
import { dayLabel, eventDate, timeLabel } from "../../../shared/time.ts";
import { activeFilterCount, applyFilters, nowAnchor, toggleValue, type Indexed } from "../filters/filter.ts";
import { facetLookup } from "../format.ts";
import { isStarred } from "../state/stars.ts";
import { navigate, openDetail, openSheet, setFilters, type AppState } from "../state/store.ts";
import { SessionRow } from "./SessionRow.tsx";

export function groupByStart(list: Indexed[], tz: string): { key: string; day: string; label: string; items: Indexed[] }[] {
  const groups: { key: string; day: string; label: string; items: Indexed[] }[] = [];
  for (const ix of list) {
    const key = ix.s.start;
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(ix);
    else {
      const day = eventDate(ix.s.start, tz);
      groups.push({ key, day, label: timeLabel(ix.s.start, tz), items: [ix] });
    }
  }
  return groups;
}

export function GroupedList({
  list,
  app,
  context,
  badges,
}: {
  list: Indexed[];
  app: AppState;
  context: string[];
  badges?: Map<string, string>;
}) {
  const tz = app.schedule!.event.timeZone;
  const lookup = useMemo(() => facetLookup(app.schedule!.facets), [app.schedule]);
  const groups = groupByStart(list, tz);
  const anchor = nowAnchor(list, app.nowMs);
  const open = (id: string) => openDetail(id, context);
  let lastDay = "";
  return (
    <div class="groups">
      {groups.map((g) => {
        const dayHead = g.day !== lastDay;
        lastDay = g.day;
        return (
          <section
            key={g.key}
            class="group"
            aria-label={`${dayLabel(g.day)} ${g.label}`}
            data-now={anchor && g !== groups[0] && g.items.includes(anchor) ? "" : undefined}
          >
            {dayHead && <h2 class="day-head">{dayLabel(g.day)}</h2>}
            <h3 class="time-head">
              {g.label}
              <span class="dim"> · {g.items.length}</span>
            </h3>
            <ul class="rows">
              {g.items.map((ix) => (
                <SessionRow
                  key={ix.s.id}
                  ix={ix}
                  tz={tz}
                  lookup={lookup}
                  starred={isStarred(app.stars, ix.s.id)}
                  nowMs={app.nowMs}
                  badge={badges?.get(ix.s.id)}
                  onOpen={open}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export function ScheduleView({ app }: { app: AppState }) {
  const schedule = app.schedule!;
  const f = app.route.filters;
  const list = useMemo(() => applyFilters(app.items, f, app.nowMs), [app.items, f, app.nowMs]);
  const lookup = useMemo(() => facetLookup(schedule.facets), [schedule]);
  const dates = schedule.facets.find((x) => x.key === "date")?.values ?? [];
  const selDates = f.sel.date ?? [];
  const n = activeFilterCount(f);
  const ids = list.map((i) => i.s.id);
  const canJump = hasNowAnchor(list, app.nowMs);
  const chips = Object.entries(f.sel).flatMap(([k, vals]) => (k === "date" ? [] : (vals ?? []).map((v) => ({ k, v }))));
  const badges = new Map<string, string>();
  for (const r of Object.values(app.stars)) if (r.starred && r.changedFrom) badges.set(r.id, "Changed");

  return (
    <div class="view">
      <div class="toolbar">
        <div class="search">
          <input
            type="search"
            placeholder="Search sessions, speakers, companies"
            aria-label="Search"
            value={f.search}
            onInput={(e) => setFilters({ ...f, search: (e.target as HTMLInputElement).value })}
          />
        </div>
        <button type="button" class={`btn${n ? " primary" : ""}`} onClick={() => openSheet("filters")}>
          Filters{n ? ` (${n})` : ""}
        </button>
      </div>
      <nav class="days" aria-label="Day">
        <button type="button" class={selDates.length === 0 ? "on" : ""} onClick={() => setFilters({ ...f, sel: { ...f.sel, date: [] } })}>
          All
        </button>
        {dates.map((d) => (
          <button
            key={d.slug}
            type="button"
            class={selDates.length === 1 && selDates[0] === d.slug ? "on" : selDates.includes(d.slug) ? "part" : ""}
            onClick={() => setFilters({ ...f, sel: { ...f.sel, date: [d.slug] } })}
          >
            {d.name.split(" ")[0]}
            <small>{d.name.split(" ").slice(1).join(" ")}</small>
          </button>
        ))}
      </nav>
      {(chips.length > 0 || f.search) && (
        <div class="active-chips">
          {chips.map(({ k, v }) => (
            <button key={`${k}:${v}`} type="button" class="chip removable" onClick={() => setFilters(toggleValue(f, k, v))}>
              {lookup.name(k, v)} <span aria-hidden="true">×</span>
              <span class="sr">Remove filter</span>
            </button>
          ))}
          <button type="button" class="link" onClick={() => setFilters({ ...f, sel: {}, search: "" })}>
            Clear all
          </button>
        </div>
      )}
      <p class="summary">
        {list.length} session{list.length === 1 ? "" : "s"}
        {!f.showPast && " · past hidden"}
        <button type="button" class="link" onClick={() => setFilters({ ...f, showPast: !f.showPast })}>
          {f.showPast ? "Hide past" : "Show past"}
        </button>
        {canJump && (
          <button type="button" class="link" onClick={() => jumpToNow()}>
            Jump to now
          </button>
        )}
      </p>
      {list.length === 0 ? (
        <div class="empty">
          <p>No sessions match.</p>
          {!f.showPast && (
            <button type="button" class="btn" onClick={() => setFilters({ ...f, showPast: true })}>
              Include past sessions
            </button>
          )}
        </div>
      ) : (
        <GroupedList list={list} app={app} context={ids} badges={badges} />
      )}
    </div>
  );
}

/** True when the list has a "now" point below its first entry, i.e. scrolling there means something. */
export function hasNowAnchor(list: Indexed[], nowMs: number): boolean {
  const a = nowAnchor(list, nowMs);
  return !!a && a !== list[0] && a.startMs !== list[0].startMs;
}

/** Scroll the current list to the element marked data-now, if any. Returns whether it did. */
export function jumpToNow(smooth = true): boolean {
  const el = document.querySelector("[data-now]");
  if (!el) return false;
  el.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "instant" });
  return true;
}

export function goTab(tab: AppState["route"]["tab"]) {
  navigate({ tab });
}
