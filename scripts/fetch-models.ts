// One-time setup for an offline demo: puts every model file the page needs in
// models/ (not in git), so the browser loads nothing from the internet.
//   npm run models
// ~1.3 GB: Bonsai 2 4B (0.95 GB), bge-small (34 MB), EmbeddingGemma (195 MB), ONNX runtime (50 MB).
import { createWriteStream, existsSync, mkdirSync, copyFileSync, readdirSync, renameSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline as pipe } from "node:stream/promises";
import { pipeline, env } from "@huggingface/transformers";
import { DEFAULT_EMBEDDER, EMBEDDERS } from "../src/embedders.ts";
import { LOCAL, MODELS } from "../src/local.ts";

const BONSAI_URL =
  "https://huggingface.co/prism-ml/Ternary-Bonsai-2-4B-gguf/resolve/main/Ternary-Bonsai-2-4B-PTQ1_0.gguf";

async function download(url: string, to: string): Promise<void> {
  if (existsSync(to)) {
    console.log(`✓ already present: ${to} (${(statSync(to).size / 1e6).toFixed(0)} MB)`);
    return;
  }
  mkdirSync(dirname(to), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url} → HTTP ${res.status}`);
  const total = Number(res.headers.get("content-length") ?? 0);
  let got = 0;
  let shown = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (c: Buffer) => {
    got += c.length;
    if (got - shown > 50e6) {
      shown = got;
      process.stdout.write(`  ${(got / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB\r`);
    }
  });
  // Write to .part first so an interrupted download is never mistaken for a finished one.
  await pipe(body, createWriteStream(to + ".part"));
  renameSync(to + ".part", to);
  console.log(`✓ downloaded: ${to} (${(got / 1e6).toFixed(0)} MB)`);
}


// --light: only what the question answering needs (~90 MB), for machines that cannot run the language model anyway.
const light = process.argv.includes("--light");

// 1. The language model, read by the browser in byte ranges.
if (!light) await download(BONSAI_URL, join(MODELS, LOCAL.bonsai));

// 2. The embedding models: let transformers.js fetch exactly the files it uses, into models/hf/.
//    bge-small (34 MB) reads the review's questions; EmbeddingGemma (195 MB) is available for evaluation comparisons.
env.cacheDir = join(MODELS, LOCAL.hf);
for (const name of light ? ["bge-small"] : ["bge-small", DEFAULT_EMBEDDER]) {
  const spec = EMBEDDERS[name]!;
  const extract = await pipeline("feature-extraction", spec.repo, {
    dtype: spec.dtype as "q4",
    ...(spec.file ? { model_file_name: spec.file } : {}),
  });
  await extract(["test"], { pooling: "mean", normalize: true });
  console.log(`✓ embedding model: ${join(MODELS, LOCAL.hf, spec.repo)}`);
}

// 3. The ONNX runtime's WebAssembly files, the same version transformers.js was built with.
const ortDist = join(import.meta.dirname, "..", "node_modules", "onnxruntime-web", "dist");
const ortTo = join(MODELS, LOCAL.ort);
mkdirSync(ortTo, { recursive: true });
for (const f of readdirSync(ortDist).filter((f) => /^ort-wasm-simd-threaded.*\.(wasm|mjs)$/.test(f))) {
  copyFileSync(join(ortDist, f), join(ortTo, f));
}
console.log(`✓ ONNX runtime: ${ortTo}`);
console.log("\nDone. Start: npm run ui  → http://localhost:5173 (open once before the demo)");
