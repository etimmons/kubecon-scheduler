import { useMemo } from "preact/hooks";
import { applyFilters, facetCounts, toggleValue } from "../filters/filter.ts";
import { chipStyle } from "../format.ts";
import { closeSheet, setFilters, type AppState } from "../state/store.ts";
import { Sheet } from "./Sheet.tsx";

const ORDER = ["date", "all-sessions", "audience-level", "cncf-projects", "subtopic", "venue", "location", "end-user-programming", "solutions-showcase-programming", "sponsored", "slides"];
const OPEN_BY_DEFAULT = new Set(["date", "all-sessions", "audience-level"]);

export function FilterSheet({ app }: { app: AppState }) {
  const schedule = app.schedule!;
  const f = app.route.filters;
  const counts = useMemo(() => facetCounts(app.items, f, schedule.facets, app.nowMs), [app.items, f, schedule, app.nowMs]);
  const total = useMemo(() => applyFilters(app.items, f, app.nowMs).length, [app.items, f, app.nowMs]);
  const facets = [...schedule.facets].sort((a, b) => {
    const ia = ORDER.indexOf(a.key);
    const ib = ORDER.indexOf(b.key);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const close = () => closeSheet("sheet");

  return (
    <Sheet
      label="Filters"
      onClose={close}
      header={
        <>
          <h2>Filters</h2>
          <button type="button" class="link" onClick={() => setFilters({ ...f, sel: {} })}>
            Clear all
          </button>
          <button type="button" class="icon-btn" aria-label="Close filters" onClick={close}>
            ×
          </button>
        </>
      }
      footer={
        <button type="button" class="btn primary wide" onClick={close}>
          Show {total} session{total === 1 ? "" : "s"}
        </button>
      }
    >
      <label class="toggle">
        <input type="checkbox" checked={f.showPast} onChange={() => setFilters({ ...f, showPast: !f.showPast })} />
        Show past sessions
      </label>
      {facets.map((def) => {
        const sel = f.sel[def.key] ?? [];
        const c = counts[def.key] ?? {};
        const values = def.values.filter((v) => (c[v.slug] ?? 0) > 0 || sel.includes(v.slug) || def.values.length <= 12);
        if (!values.length) return null;
        return (
          <details key={def.key} class="facet" open={OPEN_BY_DEFAULT.has(def.key) || sel.length > 0}>
            <summary>
              {def.label}
              {sel.length > 0 && <span class="count-pill">{sel.length}</span>}
            </summary>
            <ul class="options">
              {values.map((v) => {
                const on = sel.includes(v.slug);
                const n = c[v.slug] ?? 0;
                return (
                  <li key={v.slug}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      class={`option${on ? " on" : ""}${n === 0 && !on ? " zero" : ""}`}
                      onClick={() => setFilters(toggleValue(f, def.key, v.slug))}
                    >
                      <span class="check" aria-hidden="true" />
                      {v.color && <span class="dot" style={chipStyle(v.color)} aria-hidden="true" />}
                      <span class="opt-name">{v.name}</span>
                      <span class="opt-count">{n}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </Sheet>
  );
}
