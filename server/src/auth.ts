import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { join } from "node:path";
import { readJson, serialized, writeAtomic } from "./store.ts";

/**
 * Identity on /api/* comes from the Remote-User header that Authelia's forward-auth sets.
 * It is only trustworthy because the ingress is the only thing that can reach this pod
 * (ClusterIP + NetworkPolicy) and /api/* always passes through forward-auth there.
 * The server never reads Remote-User on any other path.
 */
export function remoteUser(req: IncomingMessage, header: string, devUser?: string): string | null {
  const v = req.headers[header.toLowerCase()];
  const user = (Array.isArray(v) ? v[0] : v)?.trim();
  if (user) return user;
  return devUser || null;
}

interface TokenFile {
  tokens: { hash: string; user: string; createdAt: string; label?: string }[];
}

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Long-lived per-device tokens for /sync/*, for installed apps whose sign-in won't stick. */
export class DeviceTokens {
  private path: string;
  constructor(dir: string) {
    this.path = join(dir, "tokens.json");
  }

  async issue(user: string, label?: string): Promise<string> {
    const token = `ks_${randomBytes(32).toString("base64url")}`;
    await serialized(this.path, async () => {
      const f = (await readJson<TokenFile>(this.path)) ?? { tokens: [] };
      f.tokens.push({ hash: sha256(token), user, createdAt: new Date().toISOString(), ...(label ? { label } : {}) });
      await writeAtomic(this.path, JSON.stringify(f, null, 1));
    });
    return token;
  }

  async verify(req: IncomingMessage): Promise<string | null> {
    const h = req.headers.authorization;
    const m = h && /^Bearer (ks_[A-Za-z0-9_-]{20,})$/.exec(h);
    if (!m) return null;
    const want = Buffer.from(sha256(m[1]), "hex");
    const f = await readJson<TokenFile>(this.path);
    for (const t of f?.tokens ?? []) {
      const have = Buffer.from(t.hash, "hex");
      if (have.length === want.length && timingSafeEqual(have, want)) return t.user;
    }
    return null;
  }
}
