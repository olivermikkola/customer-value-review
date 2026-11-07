// Headless proof that the on-device model writes the review: opens the dashboard in Chrome with
// WebGPU and runs the real code. Needs `npm run ui` running (PORT env, default 5173).
//   node scripts/review-ai-run.mjs write [customer] [priority] [4B|2B]
//   node scripts/review-ai-run.mjs ask "question" ...
import { chromium } from "playwright-core";

const [mode = "write", ...rest] = process.argv.slice(2);
const port = process.env.PORT ?? "5173";
const model = process.env.MODEL ?? "4B";
const browser = await chromium.launchPersistentContext("/tmp/lanka-chrome-profile", {
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
await page.goto(`http://localhost:${port}/?model=${model}&preload=0`);
await page.waitForFunction(() => window.__aiWrite);
await page.waitForSelector(".kpi");

if (mode === "ask") {
  const out = [];
  for (const q of rest) out.push(await page.evaluate((x) => window.__aiAsk(x), q));
  console.log(JSON.stringify(out, null, 2));
} else {
  const [customer = "CUST001", priority = "overview"] = rest;
  await page.evaluate(([c, p]) => window.__setView({ customer: c, priority: p }), [customer, priority]);
  const run = await page.evaluate(() => window.__aiWrite());
  const shot = `/tmp/lanka-review-${customer}-${priority}.png`;
  await page.screenshot({ path: shot, fullPage: false });
  console.log(JSON.stringify({ ...run, blocks: Object.fromEntries(Object.entries(run.blocks).map(([k, b]) => [k, { title: b.title, sentences: b.sentences.map((s) => `${s.by === "model" ? "AI   " : "rules"} ${s.text}`), refused: b.refused.map((r) => `${r.code}: ${r.sentence}`) }])) }, null, 2));
  console.error("screenshot:", shot);
}
await browser.close();
