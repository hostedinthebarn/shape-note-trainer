// Deploy check from the public internet (global deploy rule 3), run by `npm run deploy` after the
// upload. Real files must return 200; source, config and control paths must return 404 or 403; a
// made-up path must 404 (so this isn't a single-page app answering 200 for everything). Exits 1 on
// any failure. `node scripts/verify.mjs [base-url]`.
const BASE = (process.argv[2] ?? "https://sing.hostedinthebarn.com").replace(/\/$/, "");
const REAL = ["/", "/sw.js", "/manifest.webmanifest", "/robots.txt", "/js/shell/app.js",
  "/js/shell/audio/tap-worklet.js", "/js/shell/audio/detector-worker.js", "/font/Bravura.woff2", "/icons/icon-192.png"];
const SENSITIVE = ["/no-such-page-" + Date.now(), "/wrangler.jsonc", "/package.json", "/build.mjs", "/README.md",
  "/src/shell/app.ts", "/src/shell/sw.template.js", "/static/index.html", "/scripts/verify.mjs", "/dev/serve.mjs",
  "/packets/", "/prototypes/", "/.git/config", "/.gitignore", "/_headers", "/.env"];

const status = async (p) => (await fetch(BASE + p, { redirect: "manual", cache: "no-store" })).status;
let bad = 0;
for (const p of REAL) {
  const s = await status(p);
  if (s !== 200) { bad++; console.error(`FAIL real ${p}: ${s} (want 200)`); }
}
for (const p of SENSITIVE) {
  const s = await status(p);
  if (s !== 404 && s !== 403) { bad++; console.error(`FAIL sensitive ${p}: ${s} (want 404/403)`); }
}
const h = (await fetch(BASE + "/", { cache: "no-store" })).headers;
for (const k of ["content-security-policy", "permissions-policy", "strict-transport-security", "x-content-type-options"]) {
  if (!h.get(k)) { bad++; console.error(`FAIL header ${k} missing`); }
}
if (bad) { console.error(`verify: ${bad} failure(s) at ${BASE}`); process.exit(1); }
console.log(`verify: ${REAL.length} real paths 200, ${SENSITIVE.length} sensitive paths 404/403, headers present at ${BASE}`);
