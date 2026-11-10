# syntax=docker/dockerfile:1
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build \
 && node scraper/src/cli.ts dist/seed-schedule.json --fixture scraper/fixtures/sessionize-all-2026-11-10.json.gz

# The server has no npm runtime dependencies: Node runs the TypeScript sources directly.
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/dist/app \
    SEED_SCHEDULE=/app/dist/seed-schedule.json \
    EVENT_CONFIG=/app/events/kccncna2026.json
WORKDIR /app
COPY --from=build /src/package.json ./
COPY --from=build /src/shared ./shared
COPY --from=build /src/scraper/src ./scraper/src
COPY --from=build /src/server/src ./server/src
COPY --from=build /src/events ./events
COPY --from=build /src/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME /data
CMD ["node", "server/src/main.ts"]
