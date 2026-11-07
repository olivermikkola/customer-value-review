// Measures how often the on-device model writes sentences the checker accepts, across every
// customer and priority. Needs `npm run ui` running (PORT env). Prints a summary and writes all text to /tmp.
import { writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const port = process.env.PORT ?? "5173";
const model = process.env.MODEL ?? "4B";
const customers = (process.env.CUSTOMERS ?? "CUST001,CUST002,CUST003").split(",");
const priorities = (process.env.PRIORITIES ?? "overview,water,emissions,cost,circularity,service").split(",");
const browser = await chromium.launchPersistentContext("/tmp/cvr-chrome-profile", {
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.goto(`http://localhost:${port}/?model=${model}&preload=0`);
await page.waitForFunction(() => window.__aiWrite && document.querySelector(".card.kpi"));
let model_ = 0, total = 0, refusedN = 0, tasks = 0, tasksAllModel = 0;
const codes = {};
const all = [];
for (const c of customers) {
  for (const p of priorities) {
    await page.evaluate(([a, b]) => window.__setView({ customer: a, priority: b }), [c, p]);
    const run = await page.evaluate(() => window.__aiWrite());
    for (const [id, b] of Object.entries(run.blocks)) {
      tasks++;
      if (b.sentences.every((s) => s.by === "model")) tasksAllModel++;
      for (const r of b.refused) codes[r.code] = (codes[r.code] ?? 0) + 1;
      all.push({ customer: c, priority: p, id, title: b.title, sentences: b.sentences.map((s) => ({ by: s.by, text: s.text })), refused: b.refused.map((r) => ({ code: r.code, sentence: r.sentence })) });
    }
    model_ += run.modelSentences; total += run.totalSentences; refusedN += run.refused;
    console.error(`${c} ${p}: ${run.modelSentences}/${run.totalSentences} model, ${run.refused} refused, ${run.tokPerS} tok/s`);
  }
}
writeFileSync(`/tmp/cvr-review-eval-${model}.json`, JSON.stringify(all, null, 2));
console.log(JSON.stringify({ model, runs: customers.length * priorities.length, tasks, tasksWhollyByModel: tasksAllModel, sentences: total, byModel: model_, refused: refusedN, refusedByCode: codes }, null, 2));
await browser.close();
