// Proves the demo needs no internet: a fresh Chrome profile with every request
// outside localhost blocked. Prints anything that tried to leave.
//   npm run models && npm run ui   (in another terminal), then: node scripts/offline-check.mjs
import { chromium } from "playwright-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = process.env.PORT ?? "5173";
const profile = mkdtempSync(join(tmpdir(), "cvr-offline-"));
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
try {
  const page = await browser.newPage();
  const t0 = Date.now();
  await page.goto(`http://localhost:${port}/`);
  await page.waitForSelector(".kpi");
  await page.waitForFunction(() => /is ready|Could not load|Error:/.test(document.getElementById("aiStatus").textContent), null, {
    timeout: 180000,
  });
  const status = await page.textContent("#aiStatus");
  console.log(`model ready ${((Date.now() - t0) / 1000).toFixed(1)} s (fresh profile):`, status);
  if (!status.includes("is ready")) throw new Error("The on-device model did not load offline");
  const meaning = await page.evaluate(() => import("/intent.js").then(async (m) => {
    await m.load();
    return { phase: m.state.phase, error: m.state.error };
  }));
  console.log("embedding model:", meaning);
  if (meaning.phase !== "ready") throw new Error("The meaning model did not load offline");
  const run = await page.evaluate(() => window.__aiAsk("How much water did we save?"));
  if (!run?.sentences?.length) throw new Error("The on-device answer did not complete");
  console.log(`answer (${run.s} s):`, run.sentences.map((s) => s.text).join(" "));
  const none = await page.evaluate(() => window.__aiAsk("How do we compare with other customers?"));
  if (!none?.noData?.module) throw new Error("The no-data answer did not name its module");
  console.log(`no-data answer: ${none.noData.reason} → module: ${none.noData.module.name}`);
  await page.evaluate(() => window.__submit("How much water did we save?"));
  await page.locator("#qa").screenshot({ path: "/tmp/cvr-module.png" });
  console.log(blocked.length ? `BLOCKED ${blocked.length} external requests:\n  ${[...new Set(blocked)].join("\n  ")}` : "no external requests");
  if (blocked.length) throw new Error("The dashboard attempted external requests");
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
}
