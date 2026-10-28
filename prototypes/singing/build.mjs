// PROTOTYPE (SW-37): strip types from the local-model-written TypeScript so the
// browser can load it. Sources are the packet-run work directories gen-*/.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const SOURCES = [
  ["gen-mpm/mpm-pitch/qwen3-coder_30b/mpm.ts", "dist/mpm.js"],
  ["gen-degree/hz-to-degree/qwen3-coder_30b/degree.ts", "dist/degree.js"],
  ["gen-degree/hz-to-degree/qwen3-coder_30b/degree-types.ts", "dist/degree-types.js"],
];

await mkdir("dist", { recursive: true });
for (const [src, out] of SOURCES) {
  const js = stripTypeScriptTypes(await readFile(src, "utf8"), { mode: "strip" })
    .replace(/(from\s+["']\.\/[^"']+)\.ts(["'])/g, "$1.js$2");
  await writeFile(out, js);
  console.log(`${src} -> ${out}`);
}
