# Fly.io

Fly builds a thin wrapper around the published image (see `Dockerfile`: it fixes the volume's
ownership, then runs as the unprivileged user). One small machine with a 1 GB volume.

```sh
cd deploy/fly
# Edit fly.toml: set `app` and the matching PUBLIC_URL (https://<app>.fly.dev), and `primary_region`.
fly launch --copy-config --no-deploy      # creates the app; keep the existing config
fly volumes create data --size 1 --region den   # same region as primary_region
fly deploy
fly logs                                  # "schedule: loaded … sessions", "auth token"
```

Invite people (see [the Compose notes](../compose/README.md#invite-people) for how the links work):

```sh
fly ssh console -C "node server/src/admin.ts invite alice"
fly ssh console -C "node server/src/admin.ts list"
fly ssh console -C "node server/src/admin.ts revoke alice"
```

Notes:

- Keep it at one machine (`fly scale count 1`): stars are files on the volume.
- `auto_stop_machines = "off"` keeps the schedule refresh running. If you'd rather it sleep when idle,
  set it to `"stop"`; it then refreshes the schedule when it wakes.
- Upgrade: `fly deploy --no-cache` builds on the newest release (`latest`; `--no-cache` keeps the builder
  from reusing an older copy). To pin one, `fly deploy --build-arg TAG=v0.4.2`, or change `ARG TAG` in
  the Dockerfile.
- A custom domain: `fly certs add schedule.example.com`, then update `PUBLIC_URL`.
