# spellbook

An offline-capable PWA for the KubeCon + CloudNativeCon North America 2026 schedule. It filters on every facet at once, keeps your place when you open a session, and keeps a starred agenda that syncs across your own devices. See [docs/data-source.md](docs/data-source.md) for where the data comes from.

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
DEV_USER=me SEED_SCHEDULE=dist/app/schedule.json npm start   # http://localhost:8080
```

Add `?now=2026-11-11T10:05:00-07:00` to any URL to pin the clock for Now and Hide past.

## Test

```sh
npm run typecheck
npm test                 # scraper, filters, stars, server (vitest)
npm run test:e2e         # list/detail/scroll, filters in the URL, stars (Playwright, dev server)
PROD_URL=http://localhost:8080 npx playwright test e2e/offline.spec.ts   # offline + sync, against the built app
```

## Server configuration

| Variable | Default | |
| --- | --- | --- |
| `PORT` | `8080` | |
| `DATA_DIR` | `data` | `schedule.json`, `schedule.last-good.json`, `stars/<user>.json`, `tokens.json` |
| `STATIC_DIR` | `dist/app` | The built PWA |
| `EVENT_CONFIG` | `events/kccncna2026.json` | |
| `SEED_SCHEDULE` | unset | Used when `DATA_DIR` has no schedule yet |
| `USER_HEADER` | `Remote-User` | Set by Authelia forward-auth on `/api/*` |
| `SCRAPE` | on | `off` disables the timer (every 30 min on event days, daily otherwise) |
| `DEV_USER` | unset | Local only: accept `/api` calls without the header |

Endpoints: `GET /schedule.json` (public; ETag; gzip); `GET`/`PUT /api/stars?event=` (last-writer-wins merge by `updatedAt`); `GET /api/me`; `GET /api/login?return=`; `POST /api/device-token`; `POST /api/refresh`; `GET /api/status`; `GET`/`PUT /sync/stars` (bearer device token); `GET /healthz`.

## Deploy

GitHub Actions builds a multi-arch image to GHCR on pushes to `main`. `deploy/base` is a generic Kustomize base. Put your host, image, storage class and Authelia middleware in a gitignored overlay; see [deploy/overlays/README.md](deploy/overlays/README.md).
