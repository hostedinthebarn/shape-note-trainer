// PROTOTYPE (SW-38, throwaway): static server for the screens prototype, reached
// from the phone through a cloudflared quick tunnel. Serves an allowlist only,
// and accepts small JSON reports at POST /report into ./reports/.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 8000;

const FILES = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript"],
  "/staff.js": ["staff.js", "text/javascript"],
  "/worklet.js": ["worklet.js", "text/javascript"],
  "/worker.js": ["worker.js", "text/javascript"],
  "/manifest.webmanifest": ["manifest.webmanifest", "application/manifest+json"],
  "/font/Bravura.woff2": ["font/Bravura.woff2", "font/woff2"],
  "/dist/mpm.js": ["dist/mpm.js", "text/javascript"],
  "/dist/degree.js": ["dist/degree.js", "text/javascript"],
  "/dist/degree-types.js": ["dist/degree-types.js", "text/javascript"],
  "/dist/generator.js": ["dist/generator.js", "text/javascript"],
  "/dist/level-types.js": ["dist/level-types.js", "text/javascript"],
  "/dist/prng.js": ["dist/prng.js", "text/javascript"],
  "/dist/shapes.js": ["dist/shapes.js", "text/javascript"],
};

createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (req.method === "POST" && path === "/report") {
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (body.length > 512_000) { res.writeHead(413).end(); return; }
    }
    try { JSON.parse(body); } catch { res.writeHead(400).end(); return; }
    await mkdir(join(here, "reports"), { recursive: true });
    const name = `report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await writeFile(join(here, "reports", name), body);
    console.log("report saved:", name);
    res.writeHead(204).end();
    return;
  }
  const entry = req.method === "GET" && FILES[path];
  if (!entry) { res.writeHead(404).end("not found"); return; }
  const data = await readFile(join(here, entry[0]));
  res.writeHead(200, { "content-type": entry[1], "cache-control": "no-store" }).end(data);
}).listen(PORT, "127.0.0.1", () => console.log(`http://127.0.0.1:${PORT}`));
