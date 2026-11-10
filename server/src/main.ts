import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { EventConfig } from "../../shared/types.ts";
import { createHandler } from "./app.ts";
import { DeviceTokens } from "./auth.ts";
import { ScheduleKeeper } from "./refresh.ts";
import { StarStore } from "./stars.ts";
import { StaticFiles } from "./static.ts";

const env = process.env;
const port = Number(env.PORT ?? 8080);
const dataDir = resolve(env.DATA_DIR ?? "data");
const staticDir = resolve(env.STATIC_DIR ?? "dist/app");
const eventFile = resolve(env.EVENT_CONFIG ?? "events/kccncna2026.json");
const seed = env.SEED_SCHEDULE ? resolve(env.SEED_SCHEDULE) : null;
const userHeader = env.USER_HEADER ?? "Remote-User";
const devUser = env.DEV_USER || undefined;
const scrape = env.SCRAPE !== "off";

const cfg = JSON.parse(readFileSync(eventFile, "utf8")) as EventConfig;
if (devUser) console.warn(`DEV_USER=${devUser}: /api accepts requests without ${userHeader}. Never set this in the cluster.`);

const keeper = new ScheduleKeeper(cfg, dataDir, seed);
await keeper.load();
if (scrape) keeper.start();

const handler = createHandler({
  cfg,
  keeper,
  stars: new StarStore(dataDir),
  tokens: new DeviceTokens(dataDir),
  statics: await StaticFiles.load(staticDir),
  userHeader,
  devUser,
});

const server = createServer((req, res) => void handler(req, res));
server.listen(port, () => console.log(`kubecon-scheduler listening on :${port} (data ${dataDir})`));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    keeper.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
}
