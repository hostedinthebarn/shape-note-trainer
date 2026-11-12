// Dev server (not deployed): serves the built public/ folder plus dev-only check pages from dev/,
// on 127.0.0.1 for a cloudflared quick tunnel to the phone. Allowlist by extension; nothing
// outside public/ and dev/ is reachable. Run `npm run build` first.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 8000;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".woff2": "font/woff2", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json",
};

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname));
  const type = TYPES[extname(path) || ".html"];
  const base = path.startsWith("/dev/") ? root : join(root, "public");
  const file = join(base, path.endsWith("/") ? path + "index.html" : path);
  if (req.method !== "GET" || !type || path.includes("..") || !(file.startsWith(join(root, "public")) || file.startsWith(join(root, "dev")))) {
    res.writeHead(404).end("not found");
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" }).end(data);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}/dev/audio-check.html`));
