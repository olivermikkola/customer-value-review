// Measures question routing: word lists alone vs. word lists + a small embedding
// model, with the same ONNX model the browser uses, in Node.
//   node scripts/ask-eval.ts [e5-small|embeddinggemma]
// Questions: scripts/ask-questions-blind.json — written by a local model
// (Qwen 27B) that never saw the word lists, as a customer would ask them.
import { pipeline, env } from "@huggingface/transformers";
import { readFileSync } from "node:fs";
import { assemble } from "../src/assemble.ts";
import { matchQuestion } from "../src/ask.ts";
import { TOPICS } from "../src/topics.ts";
import { EMBEDDERS, embedText } from "../src/embedders.ts";

env.cacheDir = `${process.env.HOME}/.cache/lanka-embed`;
const { claims, drivers } = assemble();
const qs = JSON.parse(readFileSync(new URL("./ask-questions-blind.json", import.meta.url), "utf8")) as {
  q: string;
  topic: string;
}[];

const name = process.argv[2] ?? "e5-small";
const spec = EMBEDDERS[name]!;
const extract = await pipeline("feature-extraction", spec.repo, {
  dtype: spec.dtype as "q8",
  ...(spec.file ? { model_file_name: spec.file } : {}),
});
const docs = await embedText(extract, spec, TOPICS.map((t) => t.text), "doc");

let words = 0;
let both = 0;
let wordsIn = 0;
let bothIn = 0;
const has = (ids: string[], topic: string) => (topic === "none" ? ids.length === 0 : ids.includes(topic));
for (const { q, topic } of qs) {
  const [v] = await embedText(extract, spec, [q], "query");
  const sims = Object.fromEntries(TOPICS.map((t, i) => [t.id, docs[i]!.reduce((s, x, j) => s + x * v![j]!, 0)]));
  const ma = matchQuestion(q, claims, drivers).claimIds;
  const mb = matchQuestion(q, claims, drivers, sims).claimIds;
  wordsIn += Number(has(ma, topic));
  bothIn += Number(has(mb, topic));
  const a = ma[0] ?? "none";
  const b = mb[0] ?? "none";
  words += Number(a === topic);
  both += Number(b === topic);
  if (a !== b) console.log(`${b === topic ? "+" : a === topic ? "-" : " "} ${q}  (want ${topic}; words ${a}, now ${b})`);
}
console.log(`\n${name}, right fact first:          word lists ${words}/${qs.length} · + embedding ${both}/${qs.length}`);
console.log(`${name}, right fact in the answer:  word lists ${wordsIn}/${qs.length} · + embedding ${bothIn}/${qs.length}`);
