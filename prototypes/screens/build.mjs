// PROTOTYPE (SW-38): strip types from the local-model-written TypeScript so the
// browser can load it. Sources are the packet-run work directories gen-*/.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const G = "gen-generator/level-generator/qwen3-coder_30b";
const S = "gen-shapes/shape-table/qwen3-coder_30b";
const SOURCES = [
  [`${G}/generator.ts`, "dist/generator.js"],
  [`${G}/level-types.ts`, "dist/level-types.js"],
  [`${G}/prng.ts`, "dist/prng.js"],
  [`${S}/shapes.ts`, "dist/shapes.js"],
];

await mkdir("dist", { recursive: true });
for (const [src, out] of SOURCES) {
  const js = stripTypeScriptTypes(await readFile(src, "utf8"), { mode: "strip" })
    .replace(/(from\s+["']\.\/[^"']+)\.ts(["'])/g, "$1.js$2");
  await writeFile(out, js);
  console.log(`${src} -> ${out}`);
}
