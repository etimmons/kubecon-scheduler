import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, relative, sep } from "node:path";
import { gzipSync } from "node:zlib";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".txt"]);

interface Asset {
  body: Buffer;
  gz?: Buffer;
  type: string;
  etag: string;
  cache: string;
}

// The app has no third-party requests at runtime; the CSP enforces it.
export const SECURITY_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; " +
    "manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
};

function cacheFor(path: string): string {
  if (path.startsWith("assets/")) return "public, max-age=31536000, immutable";
  if (/\.(png|svg|ico)$/.test(path)) return "public, max-age=86400";
  return "no-cache"; // index.html, sw.js, workbox, manifest: always revalidate
}

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

/** The built app is small, so it is held in memory with gzip variants. */
export class StaticFiles {
  private files = new Map<string, Asset>();

  static async load(root: string): Promise<StaticFiles> {
    const sf = new StaticFiles();
    let paths: string[] = [];
    try {
      paths = await walk(root);
    } catch {
      console.warn(`static: ${root} not found; only the API will work`);
    }
    for (const p of paths) {
      const rel = relative(root, p).split(sep).join("/");
      if (rel === "schedule.json") continue; // served live by the schedule keeper
      const ext = extname(p);
      const body = await readFile(p);
      sf.files.set(rel, {
        body,
        gz: COMPRESSIBLE.has(ext) && body.length > 512 ? gzipSync(body, { level: 9 }) : undefined,
        type: TYPES[ext] ?? "application/octet-stream",
        etag: `"${createHash("sha1").update(body).digest("base64url")}"`,
        cache: cacheFor(rel),
      });
    }
    return sf;
  }

  /** Returns false if nothing matched. Unknown extension-less paths get index.html (SPA). */
  serve(req: IncomingMessage, res: ServerResponse, pathname: string): boolean {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname).replace(/^\/+/, "");
    } catch {
      return false;
    }
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    let a = this.files.get(rel);
    if (!a && !extname(rel)) a = this.files.get("index.html");
    if (!a) return false;
    send(req, res, a.body, a.gz, a.type, a.etag, a.cache);
    return true;
  }
}

export function send(
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer,
  gz: Buffer | undefined,
  type: string,
  etag: string,
  cache: string,
): void {
  const headers: Record<string, string> = {
    ...SECURITY_HEADERS,
    "content-type": type,
    "cache-control": cache,
    etag,
    vary: "accept-encoding",
  };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  const useGz = gz && /\bgzip\b/.test(String(req.headers["accept-encoding"] ?? ""));
  const payload = useGz ? gz! : body;
  if (useGz) headers["content-encoding"] = "gzip";
  headers["content-length"] = String(payload.length);
  res.writeHead(200, headers);
  res.end(req.method === "HEAD" ? undefined : payload);
}
