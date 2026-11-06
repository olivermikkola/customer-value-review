/* The review written by a model running in this browser tab (WebGPU), then
   judged by the same server-side gate as every other sentence. The model never
   sees a value and the page never shows a sentence the gate did not accept. */

import { Bonsai } from "/vendor/bonsai.js";

const HF = "https://huggingface.co/prism-ml";
export const MODELS = {
  "4B": `${HF}/Ternary-Bonsai-2-4B-gguf/resolve/main/Ternary-Bonsai-2-4B-PTQ1_0.gguf`,
  "2B": `${HF}/Ternary-Bonsai-2-2B-gguf/resolve/main/Ternary-Bonsai-2-2B-PTQ1_0.gguf`,
};

let engine = null;
let engineSize = null;

const params = new URLSearchParams(location.search);
const size = params.get("model") in MODELS ? params.get("model") : "4B";

const $ = (id) => document.getElementById(id);

function status(text) {
  $("edgeStatus").textContent = text;
}

async function load() {
  if (engine && engineSize === size) return engine;
  engine?.dispose();
  const mb = (n) => (n / 1e6).toFixed(0);
  engine = await Bonsai.load({
    model: MODELS[size],
    cache: true,
    onProgress: (p) => {
      if (p.stage === "weights") status(`Ladataan mallia ${mb(p.loaded)} / ${mb(p.total)} Mt`);
      else if (p.stage === "compile") status(`Käännetään GPU-ytimiä ${p.done}/${p.total}`);
      else status(p.message ?? p.stage);
    },
  });
  engineSize = size;
  return engine;
}

async function ask(messages) {
  let text = "";
  let tokens = 0;
  engine.reset();
  for await (const ev of engine.chat(messages, {
    thinking: false,
    maxNewTokens: 500,
    sampling: { temperature: 0.3, topP: 0.9, seed: 7 },
  })) {
    if (ev.type === "token" && ev.phase === "answer") {
      text += ev.text;
      tokens++;
      if (tokens % 8 === 0) status(`Kirjoittaa… ${tokens} tokenia`);
    }
  }
  return { text, tokens };
}

const post = (body) =>
  fetch("/gate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(
    (r) => r.json(),
  );

/** Returns the run summary; also stored on window for the headless test. */
export async function write(lens) {
  const out = $("edgeOut");
  out.replaceChildren();
  if (!navigator.gpu) {
    status("Tämä selain ei tue WebGPU:ta.");
    return null;
  }
  const t0 = performance.now();
  await load();
  const tLoaded = performance.now();

  // One small task per finding (src/llm.ts tasksFor): ask, gate, one retry, then the template.
  const tasks = await fetch(`/prompt?lens=${encodeURIComponent(lens)}`).then((r) => r.json());
  const tGen = performance.now();
  const by = new Map();
  const rejected = [];
  let keep = [];
  let tokens = 0;
  let firstRaw = "";

  for (const [i, task] of tasks.entries()) {
    status(`Kirjoittaa havaintoa ${i + 1}/${tasks.length}…`);
    const messages = [
      { role: "system", content: task.system },
      { role: "user", content: task.user },
    ];
    const first = await ask(messages);
    tokens += first.tokens;
    firstRaw += first.text + "\n";
    const scope = { claimIds: task.claimIds, driverIds: task.driverIds };
    let g = await post({ raw: first.text, keep, ...scope });
    rejected.push(...g.rejected);
    if (g.feedback) {
      status(`Portti hylkäsi — malli korjaa havaintoa ${i + 1}…`);
      const second = await ask([...messages, { role: "assistant", content: first.text }, { role: "user", content: g.feedback }]);
      tokens += second.tokens;
      g = await post({ raw: second.text, keep: g.kept, ...scope });
      rejected.push(...g.rejected);
    }
    for (const s of g.kept) if (!by.has(s)) by.set(s, "model");
    if (!g.kept.some((s) => s.includes(`[[${task.claimId}`))) {
      g = await post({ raw: task.fallback, keep: g.kept });
      by.set(task.fallback, "template");
    }
    keep = g.kept;
  }
  const result = await post({ raw: "", keep });
  const genS = (performance.now() - tGen) / 1000;
  const sentences = result.accepted.map((a, i) => ({ text: a.text, by: by.get(result.kept[i]) ?? "model" }));

  const run = {
    model: `Ternary Bonsai 2 ${size}`,
    loadS: +((tLoaded - t0) / 1000).toFixed(1),
    genS: +genS.toFixed(1),
    tokPerS: +(tokens / genS).toFixed(1),
    sentences,
    rejected: rejected.map((r) => ({ code: r.code, sentence: r.sentence })),
    raw: firstRaw,
  };
  window.__edgeRun = run;

  const ul = document.createElement("ul");
  ul.className = "edge-ok";
  for (const s of run.sentences) {
    const li = document.createElement("li");
    const tag = document.createElement("span");
    tag.className = `by by-${s.by}`;
    tag.textContent = s.by === "model" ? "AI" : "pohja";
    li.append(tag, " ", s.text);
    ul.append(li);
  }
  out.append(ul);
  if (run.rejected.length) {
    const h = document.createElement("p");
    h.className = "muted";
    h.textContent = "Portti pysäytti:";
    const bad = document.createElement("ul");
    bad.className = "edge-bad";
    for (const r of run.rejected) {
      const li = document.createElement("li");
      const code = document.createElement("span");
      code.className = "code";
      code.textContent = r.code;
      li.append(code, " ", r.sentence);
      bad.append(li);
    }
    out.append(h, bad);
  }
  status(
    `${run.model} selaimessa · ${sentences.filter((x) => x.by === "model").length}/${sentences.length} lausetta mallin kirjoittamia, ` +
      `${run.rejected.length} hylätty · ${run.tokPerS} tokenia/s`,
  );
  return run;
}

window.__edgeWrite = write;

$("edgeBtn").addEventListener("click", async (e) => {
  e.currentTarget.disabled = true;
  try {
    await write(window.__lankaLens?.() ?? "balanced");
  } catch (err) {
    status(`Virhe: ${err.message ?? err}`);
    console.error(err);
  } finally {
    e.currentTarget.disabled = false;
  }
});
