# KubeCon Scheduler

An offline-capable PWA for the KubeCon + CloudNativeCon North America 2026 schedule. It filters on every facet at once, keeps your place when you open a session, and keeps a starred agenda that syncs across your own devices. See [DESIGN.md](DESIGN.md) for the design and [docs/data-source.md](docs/data-source.md) for where the data comes from.

## Run it

```sh
npm install
npm run scrape                     # live: Sessionize API -> app/public/schedule.json
# or, offline, from the committed fixture:
node scraper/src/cli.ts app/public/schedule.json --fixture scraper/fixtures/sessionize-all-2026-11-10.json.gz
npm run dev                        # http://localhost:5173 (no sync without the server)
```

Production build plus the server, with a fake user for `/api`:

```sh
npm run build
AUTH=header DEV_USER=me SEED_SCHEDULE=dist/app/schedule.json npm start   # http://localhost:8080
```

Add `?now=2026-11-11T10:05:00-07:00` to any URL to pin the clock for Now and Hide past.

## Test

```sh
npm run typecheck
npm test                 # scraper, filters, stars, server (vitest)
npm run test:e2e         # list/detail/scroll, filters in the URL, stars (Playwright, dev server)
PROD_URL=http://localhost:8080 npx playwright test e2e/offline.spec.ts   # offline + sync, against the built app (AUTH=header)
# token mode (invite links): see the header of e2e/token.spec.ts
```

## Server configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `8080` | |
| `DATA_DIR` | `data` | `schedule.json`, `schedule.last-good.json`, `stars/<user>.json`, `tokens.json` |
| `STATIC_DIR` | `dist/app` | The built PWA |
| `EVENT_CONFIG` | `events/kccncna2026.json` | |
| `SEED_SCHEDULE` | unset | Used when `DATA_DIR` has no schedule yet |
| `AUTH` | `token` | `token`: sync with invite tokens from `server/src/admin.ts`; `/api/*` is off. `header`: also trust `USER_HEADER` on `/api/*` (only behind forward-auth) |
| `PUBLIC_URL` | unset | Lets `admin.ts invite` print a full invite link |
| `USER_HEADER` | `Remote-User` | `AUTH=header` only. Set by Authelia forward-auth on `/api/*` |
| `SCRAPE` | on | `off` disables the timer (every 30 min on event days, daily otherwise) |
| `DEV_USER` | unset | `AUTH=header`, local only: accept `/api` calls without the header |

Endpoints: `GET /schedule.json` (public; ETag; gzip); `GET /app-config.json` (sync mode, for the app); `GET`/`PUT /api/stars?event=` (last-writer-wins merge by `updatedAt`); `GET /api/me`; `GET /api/login?return=`; `POST /api/device-token`; `POST /api/refresh`; `GET /api/status`; `GET`/`PUT /sync/stars` (bearer device token); `GET /healthz`.

## Deploy

Pick one. All of them run the same app; they differ in where stars are kept.

| Option | Sync across devices | You need | Guide |
| --- | --- | --- | --- |
| **Docker Compose** | Yes, invite links | A machine with Docker and a hostname | [deploy/compose](deploy/compose/README.md) |
| **Fly.io** | Yes, invite links | A Fly account (a few dollars a month) | [deploy/fly](deploy/fly/README.md) |
| **GitHub Pages** | No, stars stay on each device | A fork of this repo | below |
| **Kubernetes** | Yes, your SSO (Authelia) or invite links | A cluster | [deploy/overlays](deploy/overlays/README.md) |

The image is `ghcr.io/runlevel-six/kubecon-scheduler`, multi-arch, built by GitHub Actions on every
push to `main` (tag `main`) and release (tags like `v0.4.0`).

**Sync and sign-in.** By default (`AUTH=token`) nobody signs in: you create an invite per person with
`node server/src/admin.ts invite <name>`, and opening the link signs that device in. That is safe on any
host. `AUTH=header` instead trusts a `Remote-User` header from a forward-auth proxy such as Authelia, and
is only safe when that proxy is the only way to reach the server; the Kubernetes base uses it.

**GitHub Pages (no server).** Fork the repo, then in the fork: Settings > Pages > Source: **GitHub
Actions**; Settings > Secrets and variables > Actions > Variables: add `PAGES` = `on`; then run the
**pages** workflow. It scrapes the schedule, builds the app and publishes it, and re-runs hourly to pick
up schedule changes. Everything works offline and stars are saved in each browser, but they don't sync.

## Another event

The app is driven by an event file: `events/kccncna2026.json` (Sessionize API code, time zone, dates,
filter groups and colors). For another LF event on Sessionize, copy it, change those fields, and point
the server (`EVENT_CONFIG=events/your-event.json`) and the scraper (`EVENT_CONFIG=… npm run scrape`) at
it. Stars are kept per event id. The seed schedule baked into the image is for KubeCon NA 2026; with
another event the server scrapes on start.
