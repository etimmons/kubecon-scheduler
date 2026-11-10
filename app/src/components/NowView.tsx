import { useMemo } from "preact/hooks";
import { timeLabel, zoneAbbr } from "../../../shared/time.ts";
import type { Indexed } from "../filters/filter.ts";
import { facetLookup } from "../format.ts";
import { isStarred } from "../state/stars.ts";
import { openDetail, type AppState } from "../state/store.ts";
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
  const { live, soon } = nowAndNext(app.items, app.nowMs, star);
  const next = live.length || soon.length ? null : app.items.find((i) => i.startMs > app.nowMs);
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
      <p class="summary">
        Venue time {timeLabel(nowIso, tz)} {zoneAbbr(app.nowMs, tz)}
      </p>
      {section("In progress", live)}
      {section("Starting within 30 min", soon)}
      {!live.length && !soon.length && (
        <div class="empty">
          <p>Nothing running right now.</p>
          {next && (
            <p class="dim">
              Next up: {next.s.title} at {timeLabel(next.s.start, tz)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
