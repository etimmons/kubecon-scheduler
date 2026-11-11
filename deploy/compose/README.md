# Docker Compose

One machine with Docker, a hostname whose DNS points at it, and ports 80 and 443 open.
Caddy gets the HTTPS certificate (the installable app needs HTTPS).

```sh
cd deploy/compose
cp .env.example .env          # set DOMAIN
docker compose up -d
docker compose logs -f app    # "schedule: loaded … sessions", "auth token"
```

## Invite people

Sync uses invite tokens; there are no passwords. One per person (each gets their own stars):

```sh
docker compose exec app node server/src/admin.ts invite alice
# Invite link (open it on each device): https://schedule.example.com/#token=ks_…
docker compose exec app node server/src/admin.ts list
docker compose exec app node server/src/admin.ts revoke alice   # their stars are kept
```

Send each person their link. Opening it signs that browser in. On iPhone, the app added to the Home
Screen has its own storage: in Safari, open the link, then Settings (⚙︎) > **Copy this device's token**,
and paste it in the installed app's Settings. Anyone with the link can use it, so treat it like a password.

## Notes

- Data (stars, tokens, the last good schedule) is in the `data` volume. Back it up with
  `docker compose cp app:/data ./backup`.
- Upgrade: set `TAG` in `.env` to a newer release, then `docker compose pull && docker compose up -d`.
- Just trying it on a laptop? Skip Caddy:
  `docker run --rm -p 8080:8080 -v ks-data:/data ghcr.io/runlevel-six/kubecon-scheduler:v0.4.0`,
  then open http://localhost:8080 (localhost counts as secure, so install and offline work too).
