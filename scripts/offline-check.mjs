// Proves the demo needs no internet: a fresh Chrome profile with every request
// outside localhost blocked. Prints anything that tried to leave.
//   npm run models && npm run ui   (in another terminal), then: node scripts/offline-check.mjs
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const profile = mkdtempSync(join(tmpdir(), "lanka-offline-"));
const browser = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME ?? "/usr/bin/google-chrome",
  headless: true,
  viewport: { width: 1280, height: 900 },
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan,WebGPU", "--use-angle=vulkan", "--ignore-gpu-blocklist"],
});
const blocked = [];
await browser.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (u.hostname === "localhost" || u.hostname === "127.0.0.1") return route.continue();
  blocked.push(u.href);
  return route.abort();
});
const page = await browser.newPage();
const t0 = Date.now();
await page.goto("http://localhost:5173/legacy");
await page.waitForFunction(() => /valmiina|epäonnistui|Virhe/.test(document.getElementById("edgeStatus").textContent), null, {
  timeout: 180000,
});
console.log(`model ready ${((Date.now() - t0) / 1000).toFixed(1)} s (fresh profile):`, await page.textContent("#edgeStatus"));
const semantic = await page.evaluate(() => import("/semantic.js").then((m) => m.loadSemantic()).then((s) => (s ? "loaded" : window.__semanticError)));
console.log("embedding model:", semantic);
const run = await page.evaluate(() => window.__edgeAnswer("Miten vedenkulutus käyttäytyi joulukuussa?"));
console.log(`answer (${run.routing}, ${run.s} s):`, run.sentences.map((s) => s.text).join(" "));
const none = await page.evaluate(() => window.__edgeAnswer("Toimitetaanko vaatteet ajallaan?"));
console.log(`no-data answer: ${none.noData} → module: ${none.module}`);
await page.locator(".askbar").screenshot({ path: "/tmp/lanka-module.png" });
console.log(blocked.length ? `BLOCKED ${blocked.length} external requests:\n  ${[...new Set(blocked)].join("\n  ")}` : "no external requests");
await browser.close();
rmSync(profile, { recursive: true, force: true });
