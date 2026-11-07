// Measures how well questions are matched to the intent they mean, on questions written
// in different words from the examples the matcher holds (tests/fixtures/questions.json).
//   node scripts/answer-eval.ts [embedder ...]      e.g. minilm bge-small embeddinggemma
// With no argument it compares keywords only against each embedder.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pipeline, env } from "@huggingface/transformers";
import { EMBEDDERS } from "../src/embedders.ts";
import { MODELS } from "../src/local.ts";
import { intentTexts, answerQuestion } from "../src/pack/answer.ts";
import { loadAll, view } from "../src/pack/api.ts";
import { interpret } from "../src/pack/view.ts";

const questions = JSON.parse(readFileSync(join(import.meta.dirname, "..", "tests", "fixtures", process.env.SET ?? "questions.json"), "utf8")) as [string, string][];
const d = await loadAll();
const L = d.ledgers.get("CUST001")!;
const v = view(d, "CUST001", new URLSearchParams())!;
const texts = intentTexts();

env.allowLocalModels = true;
env.allowRemoteModels = false;
env.localModelPath = join(MODELS, "hf");

async function embedder(name: string) {
  const spec = EMBEDDERS[name]!;
  const extract = await pipeline("feature-extraction", spec.repo, { dtype: spec.dtype as "q8", ...(spec.file ? { model_file_name: spec.file } : {}) });
  const emb = async (xs: string[], p: string) => (await extract(xs.map((x) => p + x), { pooling: "mean", normalize: true })).tolist() as number[][];
  const docs = await emb(texts.map((t) => t.text), spec.doc);
  return async (q: string) => {
    const [qv] = await emb([q], spec.query);
    const best: Record<string, number> = {};
    texts.forEach((t, i) => {
      const s = docs[i]!.reduce((a, x, j) => a + x * qv![j]!, 0);
      if (s > (best[t.id] ?? -1)) best[t.id] = s;
    });
    return best;
  };
}

type Row = { want: string; q: string; got: string; conf: string; score: number };
function report(name: string, rows: Row[]) {
  const ok = (r: Row) => r.got === r.want;
  const answerable = rows.filter((r) => r.want !== "clarify");
  const hit = answerable.filter(ok).length;
  const clar = rows.filter((r) => r.want === "clarify");
  const clarOk = clar.filter(ok).length;
  const wrongConfident = rows.filter((r) => !ok(r) && r.conf !== "low" && r.got !== "clarify").length;
  console.log(`${name.padEnd(16)} right intent ${hit}/${answerable.length} (${((100 * hit) / answerable.length).toFixed(0)}%) · off-topic caught ${clarOk}/${clar.length} · wrong-but-answered ${wrongConfident}`);
  return rows.filter((r) => !ok(r));
}

const which = process.argv.slice(2);
const results: Record<string, Row[]> = {};
const run = async (name: string, sim?: (q: string) => Promise<Record<string, number>>) => {
  const rows: Row[] = [];
  for (const [want, q] of questions) {
    const a = answerQuestion(v, q, interpret(q, L), sim ? await sim(q) : undefined);
    rows.push({ want, q, got: a.intent, conf: a.confidence, score: a.read.candidates[0]?.score ?? 0 });
  }
  results[name] = rows;
  return report(name, rows);
};
const miss: Record<string, Row[]> = {};
miss["keywords only"] = await run("keywords only");
for (const name of which.length ? which : ["minilm", "bge-small", "embeddinggemma"]) {
  try {
    const t0 = performance.now();
    const sim = await embedder(name);
    const loadMs = performance.now() - t0;
    const t1 = performance.now();
    miss[name] = await run(name, sim);
    console.log(`                 (${EMBEDDERS[name]!.mb} MB, load+embed examples ${(loadMs / 1000).toFixed(1)} s, ${((performance.now() - t1) / questions.length).toFixed(0)} ms per question incl. answer)`);
  } catch (e) {
    console.log(`${name}: unavailable (${(e as Error).message.slice(0, 80)})`);
  }
}
if (process.env.SHOW) for (const [n, rows] of Object.entries(miss)) { console.log(`\n--- misses: ${n}`); for (const r of rows) console.log(`  want ${r.want.padEnd(14)} got ${r.got.padEnd(14)} ${r.conf.padEnd(6)} ${r.score}  "${r.q}"`); }
