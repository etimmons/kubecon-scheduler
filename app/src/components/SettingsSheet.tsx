import { useState } from "preact/hooks";
import { requestDeviceToken, signInUrl } from "../sync/sync.ts";
import { closeSheet, refreshSchedule, setDeviceToken, syncNow, type AppState } from "../state/store.ts";
import { Sheet } from "./Sheet.tsx";

const STATUS: Record<string, string> = {
  idle: "Synced",
  syncing: "Syncing…",
  "signed-out": "Signed out. Stars are saved on this device only.",
  offline: "Offline. Changes will sync when you reconnect.",
  error: "Sync failed.",
  unavailable: "Sync isn't available on this server.",
};

function ago(iso: string | undefined): string {
  if (!iso) return "never";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
}

export function SettingsSheet({ app }: { app: AppState }) {
  const schedule = app.schedule!;
  const { sync } = app;
  const [issued, setIssued] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const close = () => closeSheet("sheet");
  const starredCount = Object.values(app.stars).filter((r) => r.starred).length;

  return (
    <Sheet
      label="Settings"
      onClose={close}
      header={
        <>
          <h2>Sync and data</h2>
          <button type="button" class="icon-btn" aria-label="Close settings" onClick={close}>
            ×
          </button>
        </>
      }
    >
      <section class="settings">
        <h3>Sync</h3>
        <p>
          {STATUS[sync.state] ?? sync.state}
          {sync.message && <span class="dim"> ({sync.message})</span>}
        </p>
        <p class="dim">
          {sync.meta.user ? `Signed in as ${sync.meta.user}. ` : ""}Last sync: {ago(sync.meta.lastSync)}.
          {sync.meta.dirty ? " Local changes waiting to sync." : ""}
          {sync.token ? " Using a device token." : ""}
        </p>
        <div class="btn-row">
          <button type="button" class="btn" onClick={() => void syncNow()}>
            Sync now
          </button>
          {sync.state === "signed-out" && !sync.token && (
            <a class="btn primary" href={signInUrl()}>
              Sign in to sync
            </a>
          )}
        </div>

        <details class="facet">
          <summary>Device token (if sign-in won't stick in the installed app)</summary>
          <p class="dim">
            Signed in on another browser on this device (for example Safari)? Create a token there, then paste it here in the
            installed app.
          </p>
          <div class="btn-row">
            <button
              type="button"
              class="btn"
              onClick={async () => setIssued((await requestDeviceToken()) ?? "Couldn't create a token. Sign in first.")}
            >
              Create token
            </button>
            {sync.token && (
              <button type="button" class="btn" onClick={() => setDeviceToken(null)}>
                Forget token
              </button>
            )}
          </div>
          {issued && (
            <p>
              <code class="token" onClick={() => navigator.clipboard?.writeText(issued).catch(() => {})}>
                {issued}
              </code>
            </p>
          )}
          <form
            class="btn-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (paste.trim()) setDeviceToken(paste.trim());
              setPaste("");
            }}
          >
            <input type="text" placeholder="Paste token" value={paste} onInput={(e) => setPaste((e.target as HTMLInputElement).value)} />
            <button type="submit" class="btn">
              Use token
            </button>
          </form>
        </details>

        <h3>Schedule</h3>
        <p class="dim">
          {schedule.sessions.length} sessions, fetched {ago(schedule.scrapedAt)}. {starredCount} starred.
        </p>
        <p class="dim">App version {__APP_VERSION__}.</p>
        <div class="btn-row">
          <button type="button" class="btn" disabled={app.refreshing} onClick={() => void refreshSchedule()}>
            {app.refreshing ? "Checking…" : "Check for updates"}
          </button>
          <a class="btn" href={schedule.event.sourceUrl} target="_blank" rel="noopener noreferrer">
            Official schedule
          </a>
        </div>
      </section>
    </Sheet>
  );
}
