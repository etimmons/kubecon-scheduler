# Fly.io mounts volumes owned by root, and the app image runs as the unprivileged `node` user.
# This wrapper fixes /data ownership at boot, then drops to `node` to run the server.
ARG TAG=v0.4.0
FROM ghcr.io/runlevel-six/kubecon-scheduler:${TAG}
USER root
RUN apk add --no-cache su-exec
ENTRYPOINT ["/bin/sh", "-c", "chown -R node:node /data && exec su-exec node \"$@\"", "--"]
CMD ["node", "server/src/main.ts"]
