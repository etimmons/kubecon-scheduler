# KubeCon Scheduler — KubeCon Schedule PWA Design Doc

Nov 10, 2026

## Summary

Build a single-user, offline-capable PWA that loads the full KubeCon NA 2026 schedule once, filters it on every facet at the same time, and keeps a starred personal agenda on the phone. It replaces the Sched workflow the official Sessionize app no longer supports.

**The constraint that shapes everything:** the main conference runs Nov 10–12, 2026, and today is Nov 10. A tool that ships Thursday is worth almost nothing this week. The design is therefore split into an MVP an agent can finish in one sitting (target: usable by tonight) and a later phase that makes it reusable for future events.

**What the LF page already does (verified Nov 10):** it combines filters. Several categories (OR), then Audience Level and Date (AND), narrow the list together, alongside search and the slides and past-session toggles. Opening a session shows a popup over the list; back closes it with filters and position intact; and filter state lives in the URL. So the build's own value is narrower than first framed: a starred agenda in the same place you filter (the LF page hands agendas to Sessionize), offline use, now/next, and reuse for later events. Until it ships, filter on the LF page and star in the Sessionize app.

### Goals

1. **Combined filters.** Any mix of day, track, level, session type, project, venue and free-text search, applied together (AND across facets, OR within a facet), with live result counts.
2. **Detail without losing your place.** Opening a session never resets the list, its filters or its scroll position. Back returns exactly where you were.
3. **Personal agenda.** Star sessions from the list or detail view, synced across your devices; a My Schedule view groups them by day and time and flags overlaps.
4. **Works on bad conference Wi-Fi.** After first load, the full schedule and your stars work offline.
5. **Now / next.** One tap to see what is running now and what starts in the next slot, in venue time (MST, UTC-7).

### Non-goals

- Accounts, other users, social features or sharing with other attendees. Syncing your own stars across your own devices is in scope (see Sync across devices).
- Writing anything back to Sessionize, Sched or the official app (no two-way favorites sync).
- Maps, ratings, speaker messaging, push notifications.
- Supporting events other than KubeCon NA 2026 in the MVP (the data layer is kept swappable so a later phase can).

## Data source

The primary source is the [LF schedule page](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/), scraped server-side into one `schedule.json`. Every session's text arrived in a plain HTTP fetch that runs no JavaScript, so the data is almost certainly in the served HTML. The filter controls arrived empty, which suggests the page builds its filter options in the browser from that same data.

**Confidence labels used below:** *Verified* = seen in a live fetch of the page on Nov 10. *Inferred* = reasoned from what was seen. *Unverified* = the agent must confirm.

| Claim | Status | Why it matters |
| --- | --- | --- |
| Full session text (title, time, venue, room, speakers, tags, abstract, slides link) is in the served HTML | Verified (fetch returned \~600k characters of sessions without running scripts) | A scraper needs no headless browser |
| Filter option lists are built client-side from session data | Inferred (filter panel arrived with no options) | Facets must be derived from the data, not hard-coded |
| A Sessionize API endpoint (`sessionize.com/api/v2/{id}/view/All`) backs the page | Unverified, but more likely: the page's agenda link opens Sessionize, so the event's data lives there. A public endpoint exists only if the organizer created one. The event app at kubecon-cloudnativecon-north-america-2026.sessionize.com renders in the browser, so it certainly loads a JSON feed; whether that is the public API is unverified | If found, it is a cleaner JSON source and replaces scraping |
| Each session block carries a stable ID or anchor in its markup | Unverified | Determines how stars survive a schedule refresh |
| Times are venue-local MST (UTC-7) | Verified (page states it) | Store as ISO 8601 with `-07:00` |
| The browser cannot fetch the LF page directly from another origin | Inferred (no CORS headers expected on a WordPress page) | Forces a build-time or proxy fetch, not a client fetch |

### Ingestion order (the agent tries these in order)

1. **Sessionize JSON.** Load the event's Sessionize app (kubecon-cloudnativecon-north-america-2026.sessionize.com, where the LF agenda link goes) in a browser with devtools open and record the JSON request it makes; its served HTML is only templates, so the data must come from a feed. Also check the LF page for `sessionize.com/api/v2/`. Sessionize's [API docs](https://sessionize.com/playbook/api) say endpoints are public, read-only, unauthenticated and cached server-side for up to 5 minutes. Use it if present. If the app's feed turns out to be an undocumented internal endpoint, it is acceptable for a three-day personal tool, with the HTML scrape kept as the fallback.
2. **HTML scrape.** Fetch the page, parse each session block with a DOM parser, save a dated HTML fixture, and write parser tests against it.
3. **Manual fallback.** If both break mid-conference, the last good `schedule.json` keeps working offline. Stars are never lost to a failed refresh.

### Facets seen on the page

Verified from a mobile capture of the LF page (Nov 10). The page offers List, Grid and Speakers views; filter groups All Sessions (category chips), Audience Level, End User Programming, Solutions Showcase Programming, Date and Location; toggles for Show past sessions and Slides available; and search across sessions, speakers and companies. The category list below is the page's full chip set; other groups' options were collapsed in the capture, so the app still derives every option from the data.

| Facet | Values | Status |
| --- | --- | --- |
| Category | Lightning Talks; Tutorials; Poster Sessions; Contribfest; AI Inference + Agentic; Application Development + Delivery; Breaks; Cloud Native Experience; Cloud Native Novice; Cloud Native Theater; CNCF-hosted Co-located Events; Connectivity; Data Processing + Storage; Emerging + Advanced; Experiences; Inclusion + Accessibility; Keynote Sessions; Maintainer Track; Observability; Operations + Performance; Platform Engineering; Project Lightning Talks; Project Opportunities; Project Pavilion Stage; Project Pavilion Tours; Registration; Security; Solutions Showcase; Sponsor Demo Theater; Sponsor-hosted Co-located Events | Verified, complete (30 chips, each with its own colour) |
| Audience level | Advanced, Any Level, Beginner | Verified, complete |
| End User Programming | Sessions tagged End User Talk | Inferred from the group name and tag |
| Solutions Showcase Programming | Showcase, demo theater and booth sessions | Inferred; options collapsed |
| Date | Sun Nov 8 to Thu Nov 12 | Verified |
| Location | Venue › Level › zone(s) › room, 2 to 6 parts | Verified depth; options collapsed |
| Secondary tags | Sponsored, Network Nook, Cloud Native University; Maintainer Track subtopics such as Network, Release, AI Gateway, Autoscaling | Verified, shown on session rows |
| Slides available | Toggle | Verified |
| Speaker and company | Searchable; rows read "Name, Title, Company" or "Name, Company", joined by "&" | Verified |

**Filter semantics, verified by hand on Nov 10:** three category chips selected together widened the list (OR); adding Audience Level = Advanced narrowed it, and adding a Date narrowed it again (AND across groups). Selecting a future date also hides the Show past sessions toggle. The app's F1 matches this exactly.

## Feature requirements

MVP is everything needed to plan Wednesday and Thursday from a phone; Phase 2 is polish and reuse. Each MVP row has a testable acceptance criterion the agent must meet.

| ID | Feature | Phase | Acceptance criterion |
| --- | --- | --- | --- |
| F1 | Multi-facet filters | MVP | Any combination of facets applies at once: OR within a facet, AND across facets. Each option shows the count of sessions it would leave. |
| F2 | Free-text search | MVP | Matches title, abstract, speaker names, companies and tags, case-insensitive, combined with F1. Results update within 100 ms on a mid-range phone for \~1,000 sessions. |
| F3 | Filter state in the URL | MVP | Every filter and the search term live in the query string. Reload, back/forward and a home-screen shortcut restore the same view. |
| F4 | Detail keeps your place | MVP | Opening a session shows a detail sheet over the list. Closing it (button, swipe, or browser back) returns to the same list, filters and scroll position. |
| F5 | Prev / next in detail | MVP | Detail view steps to the previous or next session in the current filtered list without closing. |
| F6 | Star sessions | MVP | One tap stars or unstars from the list row and the detail sheet. Stars persist across reloads and offline, and reach your other devices within a minute of both being online. |
| F7 | My Schedule | MVP | Starred sessions grouped by day, sorted by start time, with venue and room. Overlapping sessions are visibly flagged. |
| F8 | Now / Next | MVP | One control jumps the list to sessions in progress and those starting within 30 minutes, in MST, wherever the phone's clock zone is set. |
| F9 | Offline | MVP | After one online load, airplane mode still shows the full schedule, filters, search and stars. |
| F10 | Hide past sessions | MVP | A toggle hides sessions that have ended, on by default during the event. |
| F11 | Schedule-change detection | MVP | After a refresh, a starred session whose time or room changed is badged "Changed" and shows the old value until dismissed. A starred session missing from the refresh moves to "No longer on the schedule" with its snapshot. |
| F12 | Export | Phase 2 | Export starred sessions as `.ics` (for the phone calendar) and as JSON; import JSON back. |
| F13 | Saved filter presets | Phase 2 | Name and recall a filter combination, e.g. "Platform + Security, Advanced". |
| F14 | Multi-event support | Phase 2 | Event is a config entry (name, URL, time zone, dates); a second event works without code changes to the UI. |

**Deliberately left out of MVP:** a Grid view of time by room (the LF page and Sched both have one; Phase 2), speaker pages, maps, notes on sessions and "hide sponsored" as a separate toggle (it is already reachable through the Tags facet).

## Architecture

One small service on the home cluster serves the PWA and `schedule.json` publicly, scrapes the LF page on a timer, and keeps each user's stars behind an Authelia-protected `/api`. Every device caches the app, the schedule and its own stars, so the app keeps working offline or while the cluster is down; only refresh and sync pause.

&#91;embedded content: architecture · scraper to phone\]

Only `/api` needs a login; if the cluster is unreachable, each device keeps its cached app, schedule and stars, and sync resumes when it comes back.

### Components

| Component | Choice | Reason |
| --- | --- | --- |
| Server | One Node + TypeScript service (Fastify or plain `node:http`) serving the built app, `schedule.json` and `/api/stars` | One Deployment to own; shares types with scraper and app |
| Scraper | Runs inside the server on a timer: every 30 min Nov 10–12, daily otherwise; `POST /api/refresh` to force one | No CronJob, no volume shared between pods |
| Storage | One small Ceph-backed PVC: `schedule.json`, the last good copy, `stars/<user>.json` | One user, a few KB; no database |
| App | Vite + TypeScript + Preact | Small bundle, fast first load on conference Wi-Fi |
| Offline | `vite-plugin-pwa` (Workbox): precache the shell; `schedule.json` stale-while-revalidate; stars local-first | Works offline and through cluster outages |
| Auth | Authelia forward-auth on `/api/*` only; server reads `Remote-User` | See Hosting |
| Image and deploy | GitHub Actions builds a multi-arch image to GHCR; Kustomize base in the repo; domain and Authelia settings in a gitignored overlay | Generic config committed; deployment specifics stay private |

### Hosting: home cluster behind Authelia

**Decided Nov 10: a single-node home cluster, at a hostname set in the overlay, with Authelia on `/api/*` only.** The app shell and `schedule.json` are public data and must load without a login. A service worker fetch that meets an expired Authelia session gets a redirect to the login portal instead of data, which breaks background refresh. And an iOS home-screen web app can keep cookies separate from Safari, so a Safari login may not carry into the installed app (verify on device).

- **Authelia rules:** first a rule for the app's host with resource `^/api/` and the policy your other protected apps use, then `bypass` for the rest of that host. Authelia's regexes are Go RE2 with no lookahead, so order the rules rather than writing one negative pattern. Equivalent: attach the forward-auth middleware only to the `/api` route at the ingress.
- **Signed-out handling:** call `/api` with `Accept: application/json` and `redirect: "manual"`. A 401, a 302 or an opaque redirect means signed out: show "Sign in to sync", open the portal with a return URL, keep stars working locally.
- **Test first on the installed iPhone app.** If the session won't stick inside it, fall back to a per-device token: sign in once in Safari, the server issues a long-lived token from `/api/device-token`, and the app sends it as a bearer header to a `/sync/*` route that skips forward-auth and is validated by the server.
- **Trust boundary:** accept `Remote-User` only from the ingress. Service is ClusterIP; a NetworkPolicy admits traffic only from the ingress controller's namespace.
- **Single node:** an outage pauses sync and refresh, not the app. Use `strategy: Recreate` with the ReadWriteOnce volume.

**Checks for the host:** Authelia's session cookie domain must cover it (true when the cookie is set on the parent domain). A passkey prompt runs on the Authelia portal's origin, so test sign-in from the installed iPhone and iPad apps, not only from Safari. The hostname stays in the overlay, never in the committed base.

### Alternative: a star overlay on the LF page

A userscript could add stars and better filters to the existing page. First rejected on the belief that the page reloads on every navigation. Corrected Nov 10: it opens sessions in a popup and keeps filters in the URL, so an overlay that adds star buttons and a My Schedule panel is the cheapest way to get an agenda beside the filters this week. It still has no offline mode, and it breaks when LF changes markup. The path is an open decision below.

### Sync across devices

Stars sync through `/api/stars` on the home server, one document per Authelia user. Target devices: iPhone and iPad first, laptop as well. A secret GitHub Gist remains the no-server alternative.

**Merge model (same for every store):**

- Each star is `{ id, starred: boolean, updatedAt, snapshot }`. Unstarring writes `starred: false`, never a delete, so an unstar on one device isn't undone by another.
- Merge = for each `id`, keep the record with the latest `updatedAt`. No conflicts to resolve by hand.
- Sync runs on app open, when the app returns to the foreground, and 5 seconds after any change. Offline changes queue locally and push on reconnect.
- Device clocks can drift; use the device time at write, and accept that two edits to the same star within seconds may resolve either way.

**Store options:**

| Store | What runs | Costs and risks |
| --- | --- | --- |
| `/api/stars` on the home server (chosen) | Nothing extra: the same service and volume | Sync pauses if the single node is down; sign-in inside the installed iPhone app must be tested (see Hosting) |
| Secret GitHub Gist via the GitHub API | Nothing; the app calls api.github.com | A `gist`-scoped token per device in `localStorage`; a secret gist is unlisted, not private |
| Hosted key-value worker (e.g. Cloudflare Workers + KV) | A worker on another provider | A new account and service to manage |
| Share link or QR code | Nothing | One-way, manual; not real sync |

**Setup and API:** on each device, tap Sign in to sync once. `GET /api/stars` returns the user's records; `PUT /api/stars` sends local records, the server merges by `updatedAt` and returns the merged set, which the client stores. Settings shows the last sync time and a Sync now button.

## Data model

One normalized `schedule.json` per event, shared as TypeScript types between scraper and app. Stars store a small snapshot of each session so they survive ID changes and power change detection (F11).

```ts
// shared/types.ts
export interface ScheduleFile {
  schemaVersion: 1;
  event: { id: string; name: string; timeZone: string; sourceUrl: string };
  scrapedAt: string;            // ISO 8601, UTC
  sourceHash: string;           // sha256 of the fetched HTML/JSON, to skip no-op commits
  categories: { name: string; color?: string }[]; // the page's chip set, in its order
  sessions: Session[];
}

export interface Session {
  id: string;                   // see ID strategy below
  title: string;
  start: string;                // ISO 8601 with offset, e.g. 2026-11-10T11:30:00-07:00
  end: string;
  location: {
    path: string[];             // all parts, e.g. ["Salt Palace","Level 1","Solutions Showcase","Hall 1","Alpine Overlook Zone","Demo Theater"]
    venue: string;              // first part
    level?: string;             // first part matching /^Level \d/ (building floor)
    room: string;               // last part
  };
  speakers: { name: string; title?: string; company?: string }[];
  abstract: string;             // plain text, paragraphs kept
  facets: Record<FacetKey, string[]>; // multi-valued; empty array when absent
  links: { label: string; url: string }[]; // Slides, Website, GitHub, ...
  raw?: Record<string, string>; // unmapped tags, kept for later facets
}

export type FacetKey =
  | "category"      // the 30 coloured chips
  | "audience"      // Beginner, Any Level, Advanced, ...
  | "tags"          // End User Talk, Sponsored, Network Nook, Maintainer subtopics, ...
  | "venue" | "day" | "hasSlides";

// localStorage key: `stars:${event.id}`
export interface StarRecord {
  id: string;
  starred: boolean;             // false = unstarred, kept so the unstar syncs
  updatedAt: string;            // merge: latest updatedAt per id wins
  snapshot: { title: string; start: string; end: string; room: string };
}
```

### Session ID strategy

1. **Source ID if present.** A Sessionize session ID or a stable `id`/anchor on the session's HTML block. Check this during the data spike.
2. **Otherwise a content hash:** `sha1(normalize(title) + "|" + day)`, truncated to 12 hex characters. Time and room are left out on purpose, so a moved session keeps its ID and shows up as "Changed" rather than vanishing.
3. **Collisions** (same title twice a day, e.g. repeated lightning-talk intros) get a `-2`, `-3` suffix in start-time order.
4. **Orphaned stars** (ID no longer present) stay in My Schedule under "No longer on the schedule" with their snapshot, never silently deleted.

### Normalization rules

- Collapse whitespace; decode HTML entities; strip sponsor-disclosure boilerplate from abstracts and record it as the tag "Sponsored".
- **Location:** split on `|` and trim. Paths run 2 to 6 parts, so venue = first part, level = first part matching `Level N`, room = last part; keep the full path for display.
- **Speakers: prefer structured data.** The HTML speaker line is ambiguous: "A & B, The Trade Desk" means both work there; "A & B, Isomorphic Labs; C, Google" groups by company with `;`; keynote lines read "A, Title, Company & B, Title, Company"; companies can contain `@` ("Isovalent @ Cisco"). Use the Sessionize feed's speaker records or per-speaker markup if either exists.
- **Speaker fallback:** keep the raw line as `speakerLine` for display and search; extract names best-effort (split groups on `;`, then the part before the last ` ,  ` holds names joined by `&`). Don't block the MVP on perfect titles and companies.
- **Category colour:** take each chip's colour from the page if it is in the markup; otherwise assign a stable colour per category name.
- `day` is derived from `start` in the event time zone, never the device's.
- Unknown tags go to `raw`, so the agent can promote them to a facet later without re-scraping.

## UI and navigation

The list is never unmounted. Detail and filters open as sheets on top of it, each pushing a history entry, so back closes the sheet and leaves the list exactly as it was. This is the direct fix for the "go all the way back" problem.

### Screens

| Screen | Reached by | Contents |
| --- | --- | --- |
| Schedule | Default tab | Day tabs (Sun–Thu); search field; active-filter chips (tap to remove); time-grouped session rows; sticky time headers |
| Filter sheet | "Filters (n)" button | One collapsible group per facet with counts; "Clear all"; "Show N sessions" button |
| Detail sheet | Tap a row | Title, time, venue › level › room, speakers, facets as chips, abstract, links; star; prev/next arrows; tap a facet chip to add it as a filter |
| My Schedule | Second tab | Starred sessions by day; overlap flag; "Changed" and "No longer on the schedule" sections |
| Now | Third tab | In progress, then starting within 30 min; starred sessions first. An All / Starred toggle (remembered per device) narrows it to starred sessions |

### Session row

- Line 1: start–end time, category chip in its colour, star button (48 px touch target).
- Line 2: title, two lines max.
- Line 3: room and first speaker, in secondary text.
- Past sessions dimmed when "Hide past" is off.

### URL contract

`/?all-sessions=security|platform-engineering&audience-level=advanced&date=wed-nov-11&q=ebpf&s=<sessionId>`

- Mirror the LF page's scheme so links translate both ways: one parameter per filter group, slugged values joined by a pipe (verified: ?all-sessions=lightning-talks%7Cdata-processing-plus-storage&audience-level=advanced&date=thu-nov-12). Those slugs likely also appear on each session's markup, which would make them the scraper's facet keys; `s` opens the detail sheet.
- Filter changes use `history.replaceState` (no history spam); opening a sheet uses `pushState`.
- Restore scroll position per `day` + filter key from `sessionStorage` when the list re-renders.

### Look

Mobile-first single column; system font; light and dark via `prefers-color-scheme`; installable with a home-screen icon and standalone display mode. No design system beyond that for MVP.

## Build plan for the agent

Four MVP phases, each ending in something that works; the agent stops and reports after Phase 0 if neither data path is viable. Target for Phases 0–3: one working session.

1. **Phase 0 — Data spike (about 30 min).** Load the Sessionize event app with devtools open and record its JSON feed; also check the LF page for a Sessionize endpoint; otherwise identify the HTML structure of one session block and its filter slugs. Save what was fetched as a dated fixture under `scraper/fixtures/`.
   - Done when: `docs/data-source.md` names the chosen path, the endpoint or session-block selector, and whether stable session IDs exist.
2. **Phase 1 — Scraper module.** Parse the fixture into `ScheduleFile`.
   - Done when: unit tests pass for at least 5 hand-checked sessions (keynote, lightning talk, co-located event, sponsored demo, tutorial); the session count matches a manual count for one day; every session has `start < end`.
3. **Phase 2 — App MVP (F1–F8, F10, F11).** List, filter sheet, search, detail sheet, stars stored locally, My Schedule, Now.
   - Done when: unit tests cover filter semantics (OR within a group, AND across groups, counts) the ID collision rule, and Changed detection (a starred session whose time or room moves, or that disappears, is flagged after a refresh); one Playwright test scrolls the list, opens a session, goes back, and asserts the same scroll position and filters.
4. **Phase 3 — Server, offline, sync, deploy (F9 + sync).** Server with the scrape timer and last-good guard, `/api/stars` with merge, service worker and manifest, Dockerfile, image workflow, Kustomize base.
   - Done when: Lighthouse reports the app installable; airplane mode on the iPhone still shows schedule and stars; a star and an unstar made offline on the iPhone appear on the iPad after both reconnect; signing in to sync works from the installed iPhone app (or the device-token fallback is in place); a forced scrape failure leaves the last good schedule live.
5. **Phase 4 — After the event.** F12–F14, then generalize the event config for the next KubeCon.

### Repository layout

```text
/
├─ shared/types.ts            # ScheduleFile, Session, StarRecord
├─ events/kccncna2026.json    # name, sourceUrl, timeZone, dates
├─ scraper/
│  ├─ src/{fetch,parse,normalize,ids}.ts
│  ├─ fixtures/                # dated snapshots
│  └─ test/
├─ server/
│  ├─ src/{main,static,stars,refresh,auth}.ts
│  └─ test/
├─ app/
│  ├─ src/{state,filters,routes,sync}/
│  └─ src/components/
├─ deploy/
│  ├─ base/                    # Deployment, Service, PVC, Ingress, NetworkPolicy
│  └─ overlays/                # gitignored: domain, Authelia middleware, image tag
├─ Dockerfile
├─ docs/data-source.md
└─ .github/workflows/image.yml
```

Repository name: kubecon-scheduler. Generic config is committed; any personal deployment specifics live in a gitignored overlay.

### Rules for the agent

- Fetch the source at most once per scrape run, on a 30-minute interval during the event.
- Never replace the live `schedule.json` with one holding fewer than 80% of the previous run's sessions; keep the last good copy and log the failure.
- Keep the app bundle under 150 KB gzipped (excluding `schedule.json`).
- No analytics and no third-party requests from the app at runtime.
- Trust `Remote-User` only from the ingress; no domains, secrets or Authelia details in the committed base.

## Risks, assumptions and open questions

The biggest risk is time, not technology: the tool is only worth building this week if it is usable by tomorrow morning.

### Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| MVP not done before Wednesday sessions | Medium | Usable list, filters and local stars come first; meanwhile filter on the LF page and star in the Sessionize app |
| Sign-in to sync fails inside the installed iPhone app | Medium | Test it first in Phase 3; per-device token fallback |
| Home cluster down while you are away | Low to medium | App, schedule and stars are cached on every device; only sync and refresh pause |
| LF changes page markup mid-event | Low | Fixture tests catch it; the 80% guard keeps the last good file live |
| Session IDs unstable, stars orphaned | Medium if no source IDs | Title+day hash, snapshot on every star, orphan section |
| Scraping against site terms | Low for personal, low-rate use | One fetch per 30 min; check the LF terms before publishing the repo |
| Device clock zone not MST | High | All time math in the event zone via `Intl.DateTimeFormat`, never `Date` local getters |

### Assumptions doing real work

- **The LF web schedule is the complete source.** The official app may hold sessions or room changes the web page lacks. Not checked.
- **The LF web page itself is not already good enough.** Resolved in part: its "personal agenda" link opens Sessionize (confirmed Nov 10), so the web page has no agenda of its own and stars must be built. Its filters do combine (verified Nov 10), so F1 is parity rather than the reason to build; the reasons are the agenda, keeping your place, offline and now/next.
- **About 1,000 sessions.** Estimated from the page size; filtering is fast well beyond that.

### Open questions

- [x] Path: the full PWA now, for filters, agenda, offline and sync in one app (decided Nov 10).
- [x] Hosting: home cluster, Authelia on `/api/*` only (decided Nov 10).
- [x] Name: KubeCon Scheduler (decided Nov 10).
- [x] `/api` protection: the same Authelia policy as the cluster's other protected apps (decided Nov 10).
- [x] Changed detection (F11): in the MVP, since the star snapshots already exist (decided Nov 10).

### Sources

- [KubeCon + CloudNativeCon NA 2026 schedule](https://events.linuxfoundation.org/kubecon-cloudnativecon-north-america/program/schedule/) (fetched Nov 10, 2026; first \~100k and a late excerpt of \~600k characters read)
- [Sessionize API playbook](https://sessionize.com/playbook/api)
- [CNCF: your week in Salt Lake City](https://cncf.io/blog/2026/09/11/kubecon-cloudnativecon-north-america-2026-your-week-in-salt-lake-city)
