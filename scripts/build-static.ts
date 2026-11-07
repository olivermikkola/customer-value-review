// A copy of the dashboard that needs no server, for GitHub Pages or any static host:
//   node scripts/build-static.ts [outDir]        (default: site/)
// The browser runs the same code as the server (src/pack/*) on the pack as JSON, so every
// figure is still computed from the pack and checked to recompute; the meaning model loads from Hugging Face.
import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readPack } from "../src/pack/read.ts";
import { PACK_FILE } from "../src/pack/file.ts";

const root = join(import.meta.dirname, "..");
const out = join(root, process.argv[2] ?? "site");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const pack = await readPack(PACK_FILE);
writeFileSync(join(out, "pack.json"), JSON.stringify({ ...pack, file: "Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx" }));

const stub = join(out, ".stub.js");
writeFileSync(stub, "export default {}; export const fileURLToPath = (u) => String(u);");
await build({
  entryPoints: [join(root, "src/static/entry.ts")],
  bundle: true, format: "esm", platform: "browser", target: "es2022", minify: true,
  outfile: join(out, "engine.js"),
  alias: { exceljs: stub, "node:url": stub, "node:crypto": join(root, "src/static/crypto.js") },
  logLevel: "warning",
});
rmSync(stub);

// The pages, with absolute paths made relative so they work under /<repo>/.
const rel = (s: string) => s.replace(/(from |href=|src=|import\()(["'])\//g, "$1$2./");
for (const f of ["index.html", "dashboard.css", "dashboard.js", "narrate.js", "intent.js"]) {
  let t = rel(readFileSync(join(root, "web", f), "utf8"));
  // The shim must run before dashboard.js; the language model is never preloaded (1 GB) on a static site.
  if (f === "index.html") t = t.replace('<script src="./dashboard.js"', '<script src="./shim.js" type="module"></script>\n    <script src="./dashboard.js"');
  if (f === "narrate.js") t = t.replace("export function preload() {", "export function preload() {\n  if (window.__static) return;");
  writeFileSync(join(out, f), t);
}
cpSync(join(root, "web", "vendor"), join(out, "vendor"), { recursive: true });
writeFileSync(join(out, "shim.js"), readFileSync(join(root, "src/static/shim.js"), "utf8"));
writeFileSync(join(out, ".nojekyll"), "");
console.log("static site →", out);
