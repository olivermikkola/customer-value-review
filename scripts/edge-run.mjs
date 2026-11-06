// Headless proof that the browser model works: opens the UI in Chrome with
// WebGPU, presses "Kirjoita selaimessa", prints what the model wrote and what
// the gate did. Usage: node scripts/edge-run.mjs [lens] [4B|2B]
import { chromium } from "playwright-core";

const lens = process.argv[2] ?? "balanced";
const model = process.argv[3] ?? "4B";
const browser = await chromium.launchPersistentContext("/tmp/lanka-chrome-profile", {
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
page.on("console", (m) => m.type() === "error" && console.error("[page]", m.text()));
await page.goto(`http://localhost:5173/?model=${model}`);
await page.waitForFunction(() => window.__edgeWrite && window.__lankaLens);
let last = "";
const timer = setInterval(async () => {
  const s = await page.textContent("#edgeStatus").catch(() => "");
  if (s && s !== last && !/Ladataan/.test(s)) console.error("·", (last = s));
}, 2000);
const run = await page.evaluate((l) => window.__edgeWrite(l), lens);
clearInterval(timer);
await page.locator(".edge").screenshot({ path: `/tmp/lanka-edge-${model}-${lens}.png` });
console.log(JSON.stringify(run, null, 2));
await browser.close();
