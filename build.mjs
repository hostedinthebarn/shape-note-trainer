// Build (SW-44): strip the types from src/**/*.ts (tests excluded) into public/js/, copy the
// static allowlist into public/, then scan public/ for secret patterns. public/ is the only
// thing ever deployed; nothing reaches it except through the two lists below.
import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname, relative, extname } from "node:path";

/** Files copied from static/ into public/, by name. Add to this list deliberately. */
const STATIC = ["index.html", "font/Bravura.woff2", "font/OFL.txt", "manifest.webmanifest", "robots.txt", "_headers",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
/** Files with no extension that may sit in public/, by name: Cloudflare's static-assets headers file. */
const ALLOWED_NAMES = new Set(["_headers"]);
/** The only extensions allowed in public/ at all. */
const ALLOWED_EXT = new Set([".html", ".css", ".js", ".webmanifest", ".woff2", ".svg", ".png", ".txt"]);
/** Deploy rule: any hit aborts the build. */
const SECRETS = /client_secret|GOCSPX-|api[_-]?key|BEGIN .* PRIVATE KEY|refresh_token|AKIA|Bearer |password|token=/i;

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

await rm("public", { recursive: true, force: true });
let n = 0;
for await (const src of walk("src")) {
  if (!src.endsWith(".ts") || src.endsWith(".test.ts")) continue;
  const out = join("public/js", relative("src", src)).replace(/\.ts$/, ".js");
  const js = stripTypeScriptTypes(await readFile(src, "utf8"), { mode: "strip" })
    .replace(/(from\s+["']\.{1,2}\/[^"']+)\.ts(["'])/g, "$1.js$2");
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, js);
  n++;
}
for (const f of STATIC) {
  await mkdir(dirname(join("public", f)), { recursive: true });
  await copyFile(join("static", f), join("public", f));
  n++;
}
// SW-51: the offline service worker caches exactly what was published, keyed by a hash of it, so
// every deploy gets a fresh cache and the old one is deleted on activate.
const shipped = [];
const hash = createHash("sha256");
for await (const f of walk("public")) {
  if (basename(f) === "_headers") continue;
  shipped.push(relative("public", f).split("\\").join("/"));
  hash.update(f).update(await readFile(f));
}
shipped.sort();
const version = hash.digest("hex").slice(0, 12);
const sw = await readFile("src/shell/sw.template.js", "utf8");
await writeFile("public/sw.js", sw.replace("__VERSION__", version)
  .replace("__FILES__", JSON.stringify(["./", ...shipped.filter((f) => f !== "index.html")])));
n++;
for await (const f of walk("public")) {
  if (!ALLOWED_EXT.has(extname(f)) && !ALLOWED_NAMES.has(basename(f))) throw new Error(`build: ${f} has an extension that is not allowed in public/`);
  if (extname(f) !== ".woff2" && extname(f) !== ".png" && SECRETS.test(await readFile(f, "utf8"))) {
    throw new Error(`build: secret pattern found in ${f}; aborting`);
  }
}
console.log(`build: ${n} files into public/ (cache ${version}), allowlist and secret scan passed`);
