import { useMemo } from "preact/hooks";
import { toggleValue } from "../filters/filter.ts";
import { chipStyle, facetLookup, fullWhen } from "../format.ts";
import { isStarred } from "../state/stars.ts";
import { closeSheet, dismiss, filteredList, getState, navigate, type AppState } from "../state/store.ts";
import { Sheet } from "./Sheet.tsx";
import { StarButton } from "./StarButton.tsx";

const CHIP_FACETS = ["all-sessions", "audience-level", "subtopic", "cncf-projects", "end-user-programming", "solutions-showcase-programming", "sponsored"];

export function DetailSheet({ app, id }: { app: AppState; id: string }) {
  const schedule = app.schedule!;
  const tz = schedule.event.timeZone;
  const lookup = useMemo(() => facetLookup(schedule.facets), [schedule]);
  const s = app.byId.get(id);
  const star = app.stars[id];
  const context = useMemo(() => app.detailContext ?? filteredList().map((i) => i.s.id), [app.detailContext, app.items]);
  const pos = context.indexOf(id);
  const prev = pos > 0 ? context[pos - 1] : null;
  const next = pos >= 0 && pos < context.length - 1 ? context[pos + 1] : null;
  const close = () => closeSheet("detail");
  const step = (to: string | null) => to && navigate({ id: to }, "replace");

  const addFilter = (key: string, slug: string) => {
    const f = getState().route.filters;
    const cur = f.sel[key] ?? [];
    const filters = cur.includes(slug) ? f : toggleValue(f, key, slug);
    // Close the sheet first (history.back when pushed), then apply the filter to the list.
    closeSheet("detail", () => navigate({ filters, tab: "schedule", id: null }));
  };

  const header = (
    <>
      <button type="button" class="icon-btn" aria-label="Close" onClick={close}>
        ×
      </button>
      <div class="stepper">
        <button type="button" class="icon-btn" aria-label="Previous session" disabled={!prev} onClick={() => step(prev)}>
          ‹
        </button>
        {pos >= 0 && (
          <span class="dim">
            {pos + 1} of {context.length}
          </span>
        )}
        <button type="button" class="icon-btn" aria-label="Next session" disabled={!next} onClick={() => step(next)}>
          ›
        </button>
      </div>
      {s ? <StarButton id={s.id} starred={isStarred(app.stars, s.id)} title={s.title} /> : <span />}
    </>
  );

  if (!s) {
    return (
      <Sheet label="Session" onClose={close} header={header} contentKey={id}>
        {star ? (
          <div class="detail">
            <h1>{star.snapshot.title}</h1>
            <p class="warn-text">No longer on the schedule.</p>
            <p class="dim">
              Was {fullWhen(star.snapshot, tz)}, {star.snapshot.room}
            </p>
          </div>
        ) : (
          <p class="empty">This session isn't on the schedule.</p>
        )}
      </Sheet>
    );
  }

  return (
    <Sheet label={s.title} onClose={close} header={header} contentKey={id}>
      <article class="detail">
        <h1>{s.title}</h1>
        {star?.changedFrom && (
          <div class="banner warn">
            <strong>Changed.</strong> Was {fullWhen(star.changedFrom, tz)}, {star.changedFrom.room}.
            <button type="button" class="btn small" onClick={() => dismiss(id)}>
              Dismiss
            </button>
          </div>
        )}
        <p class="when">{fullWhen(s, tz)}</p>
        <p class="where">{s.location.path.join(" › ")}</p>
        <div class="chips">
          {CHIP_FACETS.flatMap((k) =>
            (s.facets[k] ?? []).map((v) => (
              <button
                key={`${k}:${v}`}
                type="button"
                class="chip"
                style={chipStyle(lookup.color(k, v))}
                title={`Filter by ${lookup.name(k, v)}`}
                onClick={() => addFilter(k, v)}
              >
                {lookup.name(k, v)}
              </button>
            )),
          )}
        </div>
        {(s.speakerLine || s.speakers.length > 0) && (
          <ul class="speakers">
            {s.speakers.length
              ? s.speakers.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong>
                    {(p.title || p.company) && <span class="dim">{[p.title, p.company].filter(Boolean).join(", ")}</span>}
                  </li>
                ))
              : <li>{s.speakerLine}</li>}
          </ul>
        )}
        <div class="abstract">
          {s.abstract.split(/\n{2,}/).map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        {s.links.length > 0 && (
          <ul class="links">
            {s.links.map((l) => (
              <li key={l.url}>
                <a href={l.url} target="_blank" rel="noopener noreferrer">
                  {l.label}
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    </Sheet>
  );
}
