/* The second small model in the browser: an embedding model that reads a
   question's meaning and says which of the review's topics it is closest to.
   It only ranks. Whether the review can answer at all is decided by code
   (src/ask.ts), because a small embedding model scores off-topic questions as
   close as real ones. Same model and prefixes as scripts/ask-eval.ts. */

import { pipeline, env } from "/vendor/transformers.js";

env.allowLocalModels = false;
// A small model needs few threads; all cores would heat a laptop for nothing.
env.backends.onnx.wasm.numThreads = 2;

let ready = null;

/** Loads the model and embeds the topics once. Resolves to null if anything fails: the page then uses word lists only. */
export function loadSemantic() {
  ready ??= (async () => {
    const { embedder, topics } = await fetch("/topics").then((r) => r.json());
    const extract = await pipeline("feature-extraction", embedder.repo, {
      dtype: embedder.dtype,
      device: "wasm",
      ...(embedder.file ? { model_file_name: embedder.file } : {}),
    });
    const embed = async (texts, prefix) =>
      (await extract(texts.map((t) => prefix + t), { pooling: "mean", normalize: true })).tolist();
    const docs = await embed(topics.map((t) => t.text), embedder.doc);
    return { embedder, topics, docs, embed };
  })().catch((err) => {
    console.warn("semantic routing unavailable, using word lists:", err);
    window.__semanticError = String(err?.stack ?? err);
    return null;
  });
  return ready;
}

/** Cosine similarity of the question to every topic, or null when the model is not available. */
export async function similarities(question) {
  const s = await loadSemantic();
  if (!s) return null;
  const [v] = await s.embed([question], s.embedder.query);
  return Object.fromEntries(s.topics.map((t, i) => [t.id, s.docs[i].reduce((acc, x, j) => acc + x * v[j], 0)]));
}
