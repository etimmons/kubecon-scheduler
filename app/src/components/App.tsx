import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { filterKey } from "../filters/filter.ts";
import { loadScroll, saveScroll } from "../state/storage.ts";
import { navigate, openSheet, useApp } from "../state/store.ts";
import type { Tab } from "../routes/url.ts";
import { DetailSheet } from "./DetailSheet.tsx";
import { FilterSheet } from "./FilterSheet.tsx";
import { MySchedule } from "./MySchedule.tsx";
import { NowView } from "./NowView.tsx";
import { ScheduleView } from "./ScheduleView.tsx";
import { SettingsSheet } from "./SettingsSheet.tsx";

const TABS: { tab: Tab; label: string }[] = [
  { tab: "schedule", label: "Schedule" },
  { tab: "mine", label: "My Schedule" },
  { tab: "now", label: "Now" },
];

export function App() {
  const app = useApp();
  const { route, schedule } = app;
  const scrollKey = schedule ? `${route.tab}:${route.tab === "schedule" ? filterKey(route.filters) : ""}` : "";
  const keyRef = useRef(scrollKey);
  keyRef.current = scrollKey;

  // Remember the list's scroll position per view; the list is never unmounted under a sheet.
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (keyRef.current) saveScroll(keyRef.current, window.scrollY);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  useLayoutEffect(() => {
    if (!scrollKey) return;
    window.scrollTo(0, loadScroll(scrollKey) ?? 0);
  }, [scrollKey]);

  useEffect(() => {
    document.title = schedule ? `spellbook · ${schedule.event.name}` : "spellbook";
  }, [schedule]);

  if (!schedule) {
    return (
      <main class="loading">
        <p>{app.loadError ?? "Loading schedule…"}</p>
      </main>
    );
  }

  const starredCount = Object.values(app.stars).filter((r) => r.starred).length;
  const changedCount = Object.values(app.stars).filter((r) => r.starred && r.changedFrom).length;
  const syncBad = app.sync.state === "signed-out" || app.sync.state === "error";

  return (
    <>
      <header class="appbar">
        <span class="brand">spellbook</span>
        <span class="dim event">{schedule.event.name.replace("KubeCon + CloudNativeCon", "KubeCon")}</span>
        <button type="button" class={`icon-btn${syncBad ? " attn" : ""}`} aria-label="Sync and settings" onClick={() => openSheet("settings")}>
          ⚙︎
        </button>
      </header>
      <main>
        {route.tab === "schedule" && <ScheduleView app={app} />}
        {route.tab === "mine" && <MySchedule app={app} />}
        {route.tab === "now" && <NowView app={app} />}
      </main>
      <nav class="tabbar" aria-label="Views">
        {TABS.map((t) => (
          <button
            key={t.tab}
            type="button"
            class={route.tab === t.tab ? "on" : ""}
            aria-current={route.tab === t.tab ? "page" : undefined}
            onClick={() => navigate({ tab: t.tab })}
          >
            {t.label}
            {t.tab === "mine" && starredCount > 0 && <span class="count-pill">{starredCount}</span>}
            {t.tab === "mine" && changedCount > 0 && <span class="count-pill warn">!</span>}
          </button>
        ))}
      </nav>
      {route.sheet === "filters" && <FilterSheet app={app} />}
      {route.sheet === "settings" && <SettingsSheet app={app} />}
      {route.id && <DetailSheet app={app} id={route.id} />}
    </>
  );
}
