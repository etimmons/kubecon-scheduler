# Vercel

Vercel hosts the static app, like [GitHub Pages](../../README.md#deploy): the full schedule,
filters, starring and offline use, with stars saved in each browser. **There is no sync** — the sync
server keeps stars as files on a disk, and Vercel has no persistent disk. If you want sync, use
[Compose](../compose/README.md) or [Fly.io](../fly/README.md) instead.

The build settings are in [`vercel.json`](../../vercel.json) at the repo root: `npm run build:static`
builds the app into `dist/app`, adds the live schedule and turns sync off. The Vercel free (Hobby)
plan is enough.

## Deploy

1. Fork this repo.
2. In Vercel: **Add New… > Project**, import the fork, leave **Root Directory** as the repo root, and
   deploy. Vercel reads `vercel.json`; there's nothing to fill in. Node 24 is picked from `engines` in
   `package.json` (if the build says otherwise, set **Settings > Build and Deployment > Node.js
   Version** to 24.x).

Or from the CLI, in the fork's checkout:

```sh
npx vercel@latest          # first run links the project
npx vercel@latest --prod
```

Every push to `main` redeploys. If the live scrape fails, the build fails and Vercel keeps serving the
last good deployment.

## Keep the schedule fresh

The schedule is baked in at build time, so it only changes when the site rebuilds. To rebuild hourly:

1. Vercel: **Settings > Git > Deploy Hooks**, create a hook for `main`, copy its URL.
2. GitHub, in the fork: **Settings > Secrets and variables > Actions**: add the secret
   `VERCEL_DEPLOY_HOOK` with that URL, and the variable `VERCEL` = `on`.

The `vercel-refresh` workflow then calls the hook every hour (GitHub may run it late).

## Notes

- A custom domain: **Settings > Domains**.
- Another event: set `EVENT_CONFIG` (for example `events/your-event.json`) under **Settings >
  Environment Variables**; the scrape step reads it.
