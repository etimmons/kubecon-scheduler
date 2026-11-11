import type { Indexed } from "../filters/filter.ts";
import { chipStyle, speakerSummary, timeRange, type FacetLookup } from "../format.ts";
import { StarButton } from "./StarButton.tsx";

interface Props {
  ix: Indexed;
  tz: string;
  lookup: FacetLookup;
  starred: boolean;
  nowMs: number;
  badge?: string;
  /** Mark as the list's "now" scroll target. */
  anchor?: boolean;
  onOpen: (id: string) => void;
}

export function SessionRow({ ix, tz, lookup, starred, nowMs, badge, anchor, onOpen }: Props) {
  const s = ix.s;
  const cat = s.facets["all-sessions"]?.[0];
  const past = ix.endMs <= nowMs;
  const live = ix.startMs <= nowMs && nowMs < ix.endMs;
  return (
    <li class={`row${past ? " past" : ""}`} data-id={s.id} data-now={anchor ? "" : undefined}>
      <button class="row-main" type="button" onClick={() => onOpen(s.id)}>
        <span class="row-l1">
          <span class="row-time">{timeRange(s.start, s.end, tz)}</span>
          {live && <span class="badge live">Now</span>}
          {badge && <span class="badge warn">{badge}</span>}
          {cat && (
            <span class="chip small" style={chipStyle(lookup.color("all-sessions", cat))}>
              {lookup.name("all-sessions", cat)}
            </span>
          )}
        </span>
        <span class="row-title">{s.title}</span>
        <span class="row-l3">
          {s.location.room}
          {speakerSummary(s) && <> · {speakerSummary(s)}</>}
        </span>
      </button>
      <StarButton id={s.id} starred={starred} title={s.title} />
    </li>
  );
}
