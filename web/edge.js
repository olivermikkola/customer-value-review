/* A small language model running in this browser tab (WebGPU) writes the
   review and answers questions about it. It never computes: it is handed
   finished values and may only copy them. Every sentence goes through the same
   server-side gate as the hand-written ones, and the page never shows a
   sentence the gate did not accept. */

import { Bonsai } from "/vendor/bonsai.js";

const HF = "https://huggingface.co/prism-ml";
export const MODELS = {
  "4B": `${HF}/Ternary-Bonsai-2-4B-gguf/resolve/main/Ternary-Bonsai-2-4B-PTQ1_0.gguf`,
  "2B": `${HF}/Ternary-Bonsai-2-2B-gguf/resolve/main/Ternary-Bonsai-2-2B-PTQ1_0.gguf`,
};

const params = new URLSearchParams(location.search);
const size = params.get("model") in MODELS ? params.get("model") : "4B";
const MODEL_NAME = `Ternary Bonsai 2 ${size}`;

const $ = (id) => document.getElementById(id);

function status(text) {
  $("edgeStatus").textContent = text;
}

// One engine per page, loaded once. Preloading and a click share the same promise.
let loading = null;
let busy = false;

function load() {
  const mb = (n) => (n / 1e6).toFixed(0);
  loading ??= Bonsai.load({
    model: MODELS[size],
    cache: true,
    onProgress: (p) => {
      if (busy) return;
      if (p.stage === "weights") status(`Ladataan mallia taustalla ${mb(p.loaded)} / ${mb(p.total)} Mt`);
      else if (p.stage === "compile") status(`Valmistellaan mallia ${p.done}/${p.total}`);
    },
  }).then(
    (engine) => {
      if (!busy) status(`${MODEL_NAME} valmiina tässä selaimessa. Kirjoita katsaus tai kysy alla.`);
      return engine;
    },
    (err) => {
      loading = null;
      throw err;
    },
  );
  return loading;
}

async function generate(engine, messages) {
  let text = "";
  let tokens = 0;
  engine.reset();
  for await (const ev of engine.chat(messages, {
    thinking: false,
    maxNewTokens: 300,
    sampling: { temperature: 0.3, topP: 0.9, seed: 7 },
  })) {
    if (ev.type === "token" && ev.phase === "answer") {
      text += ev.text;
      tokens++;
    }
  }
  return { text, tokens };
}

const post = (body) =>
  fetch("/gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
    (r) => r.json(),
  );

/**
 * The loop both features share: ask, gate, one retry with the gate's feedback,
 * then the task's template sentences if the model got nothing through.
 */
async function runTask(engine, task, keep, by) {
  const messages = [
    { role: "system", content: task.system },
    { role: "user", content: task.user },
  ];
  const scope = { claimIds: task.claimIds, driverIds: task.driverIds };
  const rejected = [];
  const first = await generate(engine, messages);
  let tokens = first.tokens;
  let g = await post({ raw: first.text, keep, ...scope });
  rejected.push(...g.rejected);
  if (g.feedback) {
    const second = await generate(engine, [
      ...messages,
      { role: "assistant", content: first.text },
      { role: "user", content: g.feedback },
    ]);
    tokens += second.tokens;
    g = await post({ raw: second.text, keep: g.kept, ...scope });
    rejected.push(...g.rejected);
  }
  for (const s of g.kept) if (!by.has(s)) by.set(s, "model");
  const covered = g.kept.some((s) => !keep.includes(s) && s.includes(`[[${task.claimId}`));
  if (!covered) {
    const fallbacks = task.fallbacks ?? [task.fallback];
    for (const f of fallbacks) by.set(f, "template");
    g = await post({ raw: fallbacks.join("\n"), keep: g.kept });
  }
  return { kept: g.kept, rejected, tokens };
}

function tagged(sentence, by, extra) {
  const li = document.createElement("li");
  const tag = document.createElement("span");
  tag.className = `by by-${by}`;
  tag.textContent = by === "model" ? "AI" : "pohja";
  li.append(tag, " ", sentence, ...(extra ?? []));
  return li;
}

function rejectedList(rejected) {
  const wrap = document.createElement("details");
  wrap.className = "edge-gate";
  const sum = document.createElement("summary");
  sum.textContent = `Portti pysäytti ${rejected.length} lausetta`;
  const ul = document.createElement("ul");
  ul.className = "edge-bad";
  for (const r of rejected) {
    const li = document.createElement("li");
    const code = document.createElement("span");
    code.className = "code";
    code.textContent = r.code;
    li.append(code, " ", r.shown ?? r.sentence);
    ul.append(li);
  }
  wrap.append(sum, ul);
  return wrap;
}

async function guarded(button, fn) {
  if (busy) return null;
  if (!navigator.gpu) {
    status("Tämä selain ei tue WebGPU:ta, joten tekoäly ei voi toimia tässä selaimessa.");
    return null;
  }
  busy = true;
  button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    status(`Virhe: ${err.message ?? err}`);
    console.error(err);
    return null;
  } finally {
    busy = false;
    button.disabled = false;
  }
}

/** Writes the review for a lens. Returns the run summary (also used by scripts/edge-run.mjs). */
export function write(lens) {
  return guarded($("edgeBtn"), async () => {
    const out = $("edgeOut");
    out.replaceChildren();
    status("Ladataan mallia…");
    const t0 = performance.now();
    const engine = await load();
    const tLoaded = performance.now();

    const tasks = await fetch(`/prompt?lens=${encodeURIComponent(lens)}`).then((r) => r.json());
    const by = new Map();
    const rejected = [];
    let keep = [];
    let tokens = 0;
    for (const [i, task] of tasks.entries()) {
      status(`Kirjoittaa havaintoa ${i + 1}/${tasks.length}…`);
      const r = await runTask(engine, task, keep, by);
      keep = r.kept;
      rejected.push(...r.rejected);
      tokens += r.tokens;
    }
    const result = await post({ raw: "", keep });
    const genS = (performance.now() - tLoaded) / 1000;
    const sentences = result.accepted.map((a, i) => ({ text: a.text, by: by.get(result.kept[i]) ?? "model" }));

    const run = {
      model: MODEL_NAME,
      loadS: +((tLoaded - t0) / 1000).toFixed(1),
      genS: +genS.toFixed(1),
      tokPerS: +(tokens / genS).toFixed(1),
      sentences,
      rejected: rejected.map((r) => ({ code: r.code, sentence: r.shown ?? r.sentence })),
    };

    const ul = document.createElement("ul");
    ul.className = "edge-ok";
    for (const s of sentences) ul.append(tagged(s.text, s.by));
    out.append(ul);
    if (rejected.length) out.append(rejectedList(rejected));
    status(
      `${MODEL_NAME} selaimessa · ${sentences.filter((x) => x.by === "model").length}/${sentences.length} lausetta ` +
        `mallin kirjoittamia · ${rejected.length} hylätty · ${run.tokPerS} tokenia/s`,
    );
    return run;
  });
}

/** Answers a question from the review's own claims. Returns the run summary. */
export function answer(question) {
  return guarded($("askBtn"), async () => {
    const host = $("answer");
    host.hidden = false;
    host.className = "answer";
    host.replaceChildren(Object.assign(document.createElement("p"), { className: "muted", textContent: "Haetaan todennettuja lukuja…" }));
    const t0 = performance.now();
    const res = await fetch(`/ask?q=${encodeURIComponent(question)}`).then((r) => r.json());

    if (!res.task) {
      host.className = "answer bad";
      host.replaceChildren(Object.assign(document.createElement("p"), { textContent: res.reason }));
      return { question, sentences: [], rejected: [], noData: res.reason, s: +((performance.now() - t0) / 1000).toFixed(1) };
    }

    host.replaceChildren(
      Object.assign(document.createElement("p"), { className: "muted", textContent: `Kirjoittaa vastausta: ${res.matched.join(", ")}…` }),
    );
    const engine = await load();
    const by = new Map();
    const r = await runTask(engine, res.task, [], by);
    const result = await post({ raw: "", keep: r.kept });
    const s = +((performance.now() - t0) / 1000).toFixed(1);

    const ul = document.createElement("ul");
    ul.className = "edge-ok";
    const sentences = result.accepted.map((a, i) => {
      const who = by.get(result.kept[i]) ?? "model";
      const proofs = a.claimIds.filter((id) => window.__lankaHasClaim?.(res.task.open[id] ?? id)).map((id) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "linkbtn proof-link";
        b.textContent = "todiste →";
        b.addEventListener("click", () => window.openClaim?.(res.task.open[id] ?? id));
        return b;
      });
      ul.append(tagged(a.text, who, proofs.length ? [" ", ...proofs.slice(0, 1)] : []));
      return { text: a.text, by: who, claimIds: a.claimIds };
    });
    host.className = "answer ok";
    host.replaceChildren(ul, ...(r.rejected.length ? [rejectedList(r.rejected)] : []));
    return { question, sentences, rejected: r.rejected.map((x) => ({ code: x.code, sentence: x.shown ?? x.sentence })), s };
  });
}

window.__edgeWrite = write;
window.__edgeAnswer = answer;

$("edgeBtn").addEventListener("click", () => write(window.__lankaLens?.() ?? "balanced"));
$("askForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("askInput").value.trim();
  if (q) answer(q);
});

// Start the download while the reader looks at the page; it is cached after the first visit.
if (navigator.gpu && params.get("preload") !== "0") {
  const start = () => load().catch((err) => status(`Mallin lataus epäonnistui: ${err.message ?? err}`));
  (window.requestIdleCallback ?? ((f) => setTimeout(f, 500)))(start);
}
