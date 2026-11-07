/* The on-device language model for the review (WebGPU, in this browser tab).
   It never computes: it is handed finished figures and may only restate them. Every sentence goes
   through /api/gate, which rebuilds the task from the server's own view, so nothing the model writes
   reaches the page unless the checker accepted it. If the model fails twice, the rules-written
   sentence is shown instead and marked as such. */

import { Bonsai } from "/vendor/bonsai.js";

const HF = "https://huggingface.co/prism-ml";
const MODELS = {
  "4B": `${HF}/Ternary-Bonsai-2-4B-gguf/resolve/main/Ternary-Bonsai-2-4B-PTQ1_0.gguf`,
  "2B": `${HF}/Ternary-Bonsai-2-2B-gguf/resolve/main/Ternary-Bonsai-2-2B-PTQ1_0.gguf`,
};
const qp = new URLSearchParams(location.search);
const size = qp.get("model") in MODELS ? qp.get("model") : "4B";
export const MODEL_NAME = `Ternary Bonsai 2 ${size}`;

export const supported = () => Boolean(navigator.gpu);

let listener = () => {};
export const onStatus = (fn) => (listener = fn);

let loading = null;
let busy = false;
const local = fetch("/local").then((r) => r.json()).catch(() => ({}));

export function load() {
  const mb = (n) => (n / 1e6).toFixed(0);
  loading ??= local
    .then((where) =>
      Bonsai.load({
        model: size === "4B" && where.bonsai ? where.bonsai : MODELS[size],
        cache: true,
        onProgress: (p) => {
          if (busy) return;
          if (p.stage === "weights") listener(`Loading the model in the background: ${mb(p.loaded)} of ${mb(p.total)} MB`);
          else if (p.stage === "compile") listener(`Preparing the model: ${p.done} of ${p.total}`);
        },
      }),
    )
    .then(
      (engine) => {
        if (!busy) listener(`${MODEL_NAME} is ready in this browser.`);
        return engine;
      },
      (err) => {
        loading = null;
        throw err;
      },
    );
  return loading;
}

export function preload() {
  if (!supported() || qp.get("preload") === "0") return;
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 800)))(() => load().catch((e) => listener(`Could not load the model: ${e.message ?? e}`)));
}

async function generate(engine, messages) {
  let text = "";
  let tokens = 0;
  engine.reset();
  for await (const ev of engine.chat(messages, { thinking: false, maxNewTokens: 220, sampling: { temperature: 0.3, topP: 0.9, seed: 7 } })) {
    if (ev.type === "token" && ev.phase === "answer") {
      text += ev.text;
      tokens++;
    }
  }
  return { text, tokens };
}

const gate = (body) => fetch("/api/gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());

/** Ask, gate, one retry with the checker's feedback, then the rules sentence if nothing got through. */
export async function runTask(engine, task, ctx) {
  const base = { customer: ctx.customer, params: ctx.params, task: task.id, question: ctx.question };
  const messages = [{ role: "system", content: task.system }, { role: "user", content: task.user }];
  const refused = [];
  const first = await generate(engine, messages);
  let tokens = first.tokens;
  let g = await gate({ ...base, raw: first.text, keep: [] });
  refused.push(...g.rejected);
  if (g.feedback) {
    const second = await generate(engine, [...messages, { role: "assistant", content: first.text }, { role: "user", content: g.feedback }]);
    tokens += second.tokens;
    g = await gate({ ...base, raw: second.text, keep: g.kept });
    refused.push(...g.rejected);
  }
  if (g.accepted.length && !g.feedback) {
    return { sentences: g.accepted.map((a) => ({ text: a.text, by: "model", facts: a.facts })), refused, tokens };
  }
  // Nothing clean from the model: the rules sentence stands in, and says so.
  const keptOk = g.rejected.length === 0 ? g.accepted : [];
  if (keptOk.length) return { sentences: keptOk.map((a) => ({ text: a.text, by: "model", facts: a.facts })), refused, tokens };
  return { sentences: task.fallbacks.map((t) => ({ text: t, by: "rules", facts: [] })), refused, tokens };
}

async function guarded(fn) {
  if (busy) return null;
  if (!supported()) {
    listener("This browser does not support WebGPU, so the on-device model cannot run here.");
    return null;
  }
  busy = true;
  try {
    return await fn();
  } catch (err) {
    listener(`Error: ${err.message ?? err}`);
    console.error(err);
    return null;
  } finally {
    busy = false;
  }
}

/** Write the summary and the observations for a view. Returns blocks keyed by task id. */
export function writeAll(ctx, onBlock) {
  return guarded(async () => {
    listener("Loading the model…");
    const t0 = performance.now();
    const engine = await load();
    const tLoaded = performance.now();
    const { tasks } = await fetch(`/api/narrate?${new URLSearchParams({ customer: ctx.customer, ...ctx.params })}`).then((r) => r.json());
    const blocks = {};
    let tokens = 0;
    for (const [i, task] of tasks.entries()) {
      listener(`Writing ${i + 1} of ${tasks.length}: ${task.title.slice(0, 70)}…`);
      const r = await runTask(engine, task, ctx);
      tokens += r.tokens;
      blocks[task.id] = { title: task.title, kind: task.kind, sentences: r.sentences, refused: r.refused };
      onBlock?.(task.id, blocks[task.id]);
    }
    const genS = (performance.now() - tLoaded) / 1000;
    const all = Object.values(blocks);
    const model = all.flatMap((b) => b.sentences).filter((s) => s.by === "model").length;
    const total = all.flatMap((b) => b.sentences).length;
    const refused = all.flatMap((b) => b.refused).length;
    const run = { model: MODEL_NAME, loadS: +((tLoaded - t0) / 1000).toFixed(1), genS: +genS.toFixed(1), tokPerS: +(tokens / genS).toFixed(1), modelSentences: model, totalSentences: total, refused, blocks };
    listener(`${MODEL_NAME} wrote ${model} of ${total} sentences · the checker refused ${refused} · ${run.tokPerS} tokens/s`);
    return run;
  });
}

/** Answer a free-text question about the review. */
export function ask(ctx, question) {
  return guarded(async () => {
    const t0 = performance.now();
    const res = await fetch(`/api/answer?${new URLSearchParams({ customer: ctx.customer, q: question, ...ctx.params })}`).then((r) => r.json());
    if (res.noData) return { question, noData: res.noData, interpretation: res.interpretation, s: +((performance.now() - t0) / 1000).toFixed(1) };
    listener("Loading the model…");
    const engine = await load();
    listener("Writing the answer…");
    const r = await runTask(engine, res.task, { customer: ctx.customer, params: res.params, question });
    listener(`${MODEL_NAME} answered from ${res.interpretation.matched.join(", ") || "the overall view"}.`);
    return { question, interpretation: res.interpretation, sentences: r.sentences, refused: r.refused, s: +((performance.now() - t0) / 1000).toFixed(1) };
  });
}
