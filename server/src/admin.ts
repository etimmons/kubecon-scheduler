// Manage sync users (invite tokens). Run where the server's DATA_DIR is, e.g.:
//   docker compose exec app node server/src/admin.ts invite alice "Alice's phone"
//   fly ssh console -C "node server/src/admin.ts invite alice"
// Usage: node server/src/admin.ts invite <user> [label] | list | revoke <user>
import { resolve } from "node:path";
import { DeviceTokens } from "./auth.ts";
import { userKey } from "./stars.ts";

const dataDir = resolve(process.env.DATA_DIR ?? "data");
const publicUrl = (process.env.PUBLIC_URL ?? "").replace(/\/+$/, "");
const tokens = new DeviceTokens(dataDir);
const [cmd, user, ...rest] = process.argv.slice(2);

function usage(): never {
  console.error("usage: admin.ts invite <user> [label] | list | revoke <user>");
  process.exit(2);
}

if (cmd === "invite") {
  if (!user || userKey(user) !== user.toLowerCase()) {
    console.error("user: letters, digits, . _ @ - only");
    usage();
  }
  const token = await tokens.issue(user.toLowerCase(), rest.join(" ") || undefined);
  console.log(`Token for ${user.toLowerCase()}: ${token}`);
  if (publicUrl) console.log(`Invite link (open it on each device): ${publicUrl}/#token=${token}`);
  else console.log("Set PUBLIC_URL to also print an invite link. Or paste the token in Settings > Device token.");
} else if (cmd === "list") {
  const all = await tokens.list();
  if (!all.length) console.log("No tokens.");
  for (const t of all) console.log(`${t.user}\t${t.createdAt}${t.label ? `\t${t.label}` : ""}`);
} else if (cmd === "revoke") {
  if (!user) usage();
  console.log(`Removed ${await tokens.revoke(user.toLowerCase())} token(s) for ${user.toLowerCase()}. Their stars are kept.`);
} else usage();
