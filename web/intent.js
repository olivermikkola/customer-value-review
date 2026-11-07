/* The small meaning model: a ~34 MB sentence-embedding model that runs on the CPU (WASM), so it
   works on laptops without a usable GPU. It never writes anything. It scores how close a question is
   to the example phrasings of each topic the review can answer; the server combines that with
   keyword rules and composes the answer from the figures (src/pack/answer.ts).
   If it cannot load, questions are still answered from keywords alone. */

import { pipeline, env } from "/vendor/transformers.js";

env.allowLocalModels = false;
// A small model needs few threads; all cores would heat a laptop for nothing.
env.backends.onnx.wasm.numThreads = Math.min(2, navigator.hardwareConcurrency ?? 2);

let ready = null;
let listener = () => {};
export const onStatus = (fn) => (listener = fn);
export const state = { phase: "idle", name: "", mb: 0 };

/** Loads the model and embeds the example phrasings once. Resolves to null if anything fails. */
export function load() {
  ready ??= (async () => {
    state.phase = "loading";
    listener();
    const cfg = await fetch("/api/intents").then((r) => r.json());
    const spec = cfg.embedder;
    state.name = cfg.embedderId;
    state.mb = spec.mb;
    // Local files from this server when present (npm run models): no Hugging Face, no CDN.
    if (cfg.hf) {
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = cfg.hf;
    }
    if (cfg.ort) env.backends.onnx.wasm.wasmPaths = cfg.ort;
    const extract = await pipeline("feature-extraction", spec.repo, { dtype: spec.dtype, device: "wasm" });
    const embed = async (texts, prefix) => (await extract(texts.map((t) => prefix + t), { pooling: "mean", normalize: true })).tolist();
    const docs = await embed(cfg.intents.map((i) => i.text), spec.doc);
    state.phase = "ready";
    listener();
    return { cfg, spec, docs, embed };
  })().catch((err) => {
    console.warn("meaning model unavailable, using keywords only:", err);
    state.phase = "failed";
    state.error = String(err?.message ?? err);
    listener();
    return null;
  });
  return ready;
}

export function preload() {
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 500)))(() => load());
}

/**
 * The best cosine similarity per intent id for a question, or null if the model is not (yet) available.
 * Waits at most `waitMs` for a model that is still loading, so a question never hangs.
 */
export async function similarities(question, waitMs = 4000) {
  const m = await Promise.race([load(), new Promise((r) => setTimeout(() => r(null), waitMs))]);
  if (!m) return null;
  const [q] = await m.embed([question], m.spec.query);
  const best = {};
  m.cfg.intents.forEach((it, i) => {
    const s = m.docs[i].reduce((acc, x, j) => acc + x * q[j], 0);
    if (s > (best[it.id] ?? -1)) best[it.id] = +s.toFixed(4);
  });
  return best;
}
