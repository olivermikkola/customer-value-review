// Headless proof that the browser model works: opens the UI in Chrome with
// WebGPU and runs the real buttons. Needs `npm run ui` running.
//   node scripts/edge-run.mjs [lens] [4B|2B]          write the review
//   node scripts/edge-run.mjs ask "kysymys" ...        answer questions
import { chromium } from "playwright-core";

const asking = process.argv[2] === "ask";
const lens = asking ? "balanced" : (process.argv[2] ?? "balanced");
const model = asking ? (process.env.MODEL ?? "4B") : (process.argv[3] ?? "4B");
const questions = asking ? process.argv.slice(3) : [];

const browser = await chromium.launchPersistentContext("/tmp/lanka-chrome-profile", {
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
await page.goto(`http://localhost:5173/legacy?model=${model}&preload=0`);
await page.waitForFunction(() => window.__edgeWrite && window.__lankaLens);

if (asking) {
  const runs = [];
  // Let the embedding model finish loading first, as it would while a person reads the page.
  await page.evaluate(() => import("/semantic.js").then((m) => m.loadSemantic()));
  for (const [i, q] of questions.entries()) {
    runs.push(await page.evaluate((x) => window.__edgeAnswer(x), q));
    await page.locator(".askbar").screenshot({ path: `/tmp/lanka-ask-${i + 1}.png` });
  }
  console.log(JSON.stringify(runs, null, 2));
} else {
  const run = await page.evaluate((l) => window.__edgeWrite(l), lens);
  await page.locator(".edge").screenshot({ path: `/tmp/lanka-edge-${model}-${lens}.png` });
  console.log(JSON.stringify(run, null, 2));
}
await browser.close();
