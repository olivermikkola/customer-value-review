import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { buildUiData } from "../src/export.ts";

const ROOT = join(import.meta.dirname, "..");

function must<T>(value: T | null, what: string): T {
  assert.ok(value, `missing: ${what}`);
  return value;
}

/** Boot the real app.js against the real payload, in a real DOM. */
async function boot() {
  const html = readFileSync(join(ROOT, "web", "index.html"), "utf8");
  const js = readFileSync(join(ROOT, "web", "app.js"), "utf8");
  const data = JSON.parse(JSON.stringify(buildUiData()));

  const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
  const { window } = dom;
  window.fetch = (async () => ({ json: async () => data })) as unknown as typeof window.fetch;
  window.eval(js);
  await new Promise((r) => setTimeout(r, 30));

  const doc = window.document;
  return {
    doc,
    q: (sel: string) => must(doc.querySelector(sel) as HTMLElement | null, sel),
    all: (sel: string) => [...doc.querySelectorAll(sel)] as HTMLElement[],
    text: (sel: string) => must(doc.querySelector(sel), sel).textContent ?? "",
  };
}

test("the first screen explains what this is and what was found", async () => {
  const { text, all } = await boot();
  assert.match(text("#heroTitle"), /Mitä arvoa me oikeasti loimme/);
  assert.match(text("#scope"), /6 toimipistettä/);
  assert.match(text("#counts"), /243 raakatapahtumaa/);
  assert.match(text("#counts"), /94 laskettua mittaria/);
  assert.equal(all(".takeaway").length, 3);
  assert.match(all(".takeaway")[0]?.textContent ?? "", /Veden ominaiskulutus: 14,0 %/);
  assert.match(all(".takeaway")[1]?.textContent ?? "", /53,4 %/);
});

test("every card carries a plain-language meaning, not just a number", async () => {
  const { all } = await boot();
  for (const card of all(".card")) {
    assert.ok(card.querySelector(".card-meaning"), `missing meaning: ${card.textContent}`);
  }
  assert.match(all(".card")[0]?.querySelector(".card-meaning")?.textContent ?? "", /tehokkuusongelma/);
});

test("clicking a takeaway opens the observation that proves it", async () => {
  const { all, text } = await boot();
  all(".takeaway")[2]?.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(text("#detail"), /Katoamisen kustannus/);
});

test("the app boots and renders three observation cards", async () => {
  const { q, all } = await boot();
  assert.equal(all(".card").length, 3);
  assert.match(q("#customer").textContent ?? "", /Ravintolaketju Pohjola · Q3 2025/);
});

test("the default lens is sustainability, so water leads", async () => {
  const { q } = await boot();
  assert.equal(q(".card h3").textContent, "Veden ominaiskulutus");
});

test("the detail shows the claim, the chain and the counterfactual", async () => {
  const { text } = await boot();
  assert.match(text("#detail"), /14,0 %/);
  assert.match(text("#detail"), /Mistä luku tulee/);
  assert.match(text("#detail"), /summa 3 raakatapahtumasta/);
  assert.match(text("#detail"), /Vastatarkistus/);
  assert.match(text("#detail"), /0,1112 m³\/kg/);
});

test("the 53 % attribution appears on the volume observation", async () => {
  const { all, text } = await boot();
  const card = must(
    all(".card").find((c) => (c.textContent ?? "").includes("Veden kokonaiskulutus")) ?? null,
    "volume card",
  );
  card.click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(text("#detail"), /53,4 %/);
  assert.match(text("#detail"), /selittämätön 47 %/);
});

test("the trade-off explorer marks C as a rebound and only B as measurable", async () => {
  const { text, all } = await boot();
  assert.match(text("#detail"), /klassinen rebound/i);
  assert.match(text("#detail"), /Ei mitattavissa tässä datasetissä/);
  const buttons = all("#detail button.btn");
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0]?.textContent, "Hyväksy ja seuraa");
});

test("accepting creates a commitment, and the jump measures it", async () => {
  const { q, text } = await boot();
  q("#detail button.btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(text("#ledger"), /baseline 0,1096 → tavoite −8,0 %/);

  q("#ledger button.btn").click();
  await new Promise((r) => setTimeout(r, 20));
  assert.match(text("#ledger"), /mitattu −9,2 %/);
  assert.match(text("#ledger"), /tavoite ylitetty/);
});

test("the ask bar answers, and shows the rejection code when the gate fires", async () => {
  const { q, all, text } = await boot();
  const chips = all(".chip");

  must(chips[0] ?? null, "first chip").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(q("#answer").className, "answer ok");
  assert.match(text("#answer"), /53 %/);

  must(chips[1] ?? null, "second chip").click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(q("#answer").className, "answer bad");
  assert.match(text("#answer"), /UNSUPPORTED_SUPERLATIVE/);
});

test("switching lens reorders without changing the numbers", async () => {
  const { q, all, text } = await boot();
  const tabs = all(".lens button");
  const cost = must(tabs.find((t) => t.textContent === "Talous") ?? null, "cost tab");
  cost.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(q(".card h3").textContent, "Katoamisen kustannus");

  const before = text(".card .value");
  const sustain = must(tabs.find((t) => t.textContent === "Vastuullisuus") ?? null, "sustain tab");
  sustain.click();
  await new Promise((r) => setTimeout(r, 10));
  assert.notEqual(text(".card .value"), before);
});
