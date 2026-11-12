// Build (SW-44): strip the types from src/**/*.ts (tests excluded) into public/js/, copy the
// static allowlist into public/, then scan public/ for secret patterns. public/ is the only
// thing ever deployed; nothing reaches it except through the two lists below.
import { readdir, readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { stripTypeScriptTypes } from "node:module";
import { join, dirname, relative, extname, sep } from "node:path";

/** Files copied from static/ into public/, by name. Add to this list deliberately. */
const STATIC = ["index.html", "practice/index.html", "landing.css", "landing.js", "font/Bravura.woff2", "font/OFL.txt", "manifest.webmanifest", "robots.txt", "_headers",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];
/** Cloudflare control files: allowed only at the public/ root, never precached by the service worker. */
const CONTROL = new Set(["_headers"]);
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
// The engine starts the detector worker from a blob URL (offline on iPhone, see engine.ts), where
// relative imports can't resolve, so the worker ships as one file with the detector inlined.
{
  const W = "public/js/shell/audio/detector-worker.js";
  const mpm = (await readFile("public/js/core/mpm.js", "utf8")).replace(/^export\s+/gm, "");
  const body = (await readFile(W, "utf8")).replace(/^import [^\n]*core\/mpm\.js["'];?\n/m, "");
  if (/^\s*(import|export)\b/m.test(mpm + body)) throw new Error("build: detector worker still has an import or export after inlining");
  await writeFile(W, `// Built: src/core/mpm.ts inlined ahead of the worker.\n${mpm}\n${body}`);
}
for (const f of STATIC) {
  await mkdir(dirname(join("public", f)), { recursive: true });
  await copyFile(join("static", f), join("public", f));
  n++;
}
// One pass over everything that will ship: the allowlist, the secret scan (binary files too, read
// as latin1, so a PNG text chunk can't carry a token past it) and the inputs to the cache version.
const files = [];
for await (const f of walk("public")) files.push(relative("public", f).split(sep).join("/"));
files.sort();
const hash = createHash("sha256");
const scan = (name, buf) => {
  if (SECRETS.test(buf.toString("latin1"))) throw new Error(`build: secret pattern found in ${name}; aborting`);
};
for (const f of files) {
  if (CONTROL.has(f)) continue;
  if (!ALLOWED_EXT.has(extname(f))) throw new Error(`build: ${f} has an extension that is not allowed in public/`);
  const buf = await readFile(join("public", f));
  scan(f, buf);
  hash.update(f).update("\0").update(buf);
}
for (const f of CONTROL) if (files.includes(f)) scan(f, await readFile(join("public", f)));

// SW-51: the service worker precaches exactly what was published. Its cache name is a hash of the
// sorted file list, their contents and the template itself, so it is stable across machines and
// changes whenever any shipped byte (or the worker's own logic) does.
const template = await readFile("src/shell/sw.template.js", "utf8");
const version = hash.update("sw.template.js\0").update(template).digest("hex").slice(0, 12);
// The two pages are cached under their folder URLs; every other file by name.
const precache = ["./", "./practice/", ...files.filter((f) => !CONTROL.has(f) && !f.endsWith("index.html"))];
const sw = template.replace("__VERSION__", version).replace("__FILES__", JSON.stringify(precache));
scan("sw.js", Buffer.from(sw));
await writeFile("public/sw.js", sw);
n++;
console.log(`build: ${n} files into public/ (cache ${version}), allowlist and secret scan passed`);
