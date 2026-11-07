import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import JSZip from "jszip";
import { deck, loadAll, view, type Loaded } from "../src/pack/api.ts";

let d: Loaded;
before(async () => {
  d = await loadAll();
});

async function slides(customer: string, qs: string) {
  const out = await deck(d, customer, new URLSearchParams(qs));
  assert.ok(out);
  const zip = await JSZip.loadAsync(out.body);
  const names = Object.keys(zip.files);
  const text = async (re: RegExp) =>
    (await Promise.all(names.filter((n) => re.test(n)).sort((a, b) => Number(a.match(/(\d+)\.xml$/)![1]) - Number(b.match(/(\d+)\.xml$/)![1])).map((n) => zip.file(n)!.async("string")))).map((x) => [...x.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(" "));
  return { name: out.name, slideText: await text(/^ppt\/slides\/slide\d+\.xml$/), notes: await text(/^ppt\/notesSlides\/notesSlide\d+\.xml$/), names };
}

describe("PowerPoint export", () => {
  test("a valid .pptx with 11 slides, a native chart, and the synthetic notice on every slide", async () => {
    const s = await slides("CUST001", "priority=cost");
    assert.match(s.name, /^NorthStar_Foods_Group_review_2025_cost\.pptx$/);
    assert.equal(s.slideText.length, 11);
    assert.ok(s.names.some((n) => n.startsWith("ppt/charts/chart")));
    assert.match(s.slideText[0]!, /Synthetic data/);
    for (const t of s.slideText.slice(1)) assert.match(t, /Synthetic data from the Since AI Hackathon pack/);
  });

  test("every headline figure on the deck is the dashboard's figure, and its notes name the measure", async () => {
    for (const [c, qs] of [["CUST001", "priority=water&baseline=B_HOME&scenario=low"], ["CUST002", "priority=cost&period=Q3"], ["CUST003", "priority=service"]] as const) {
      const v = view(d, c, new URLSearchParams(qs))!;
      const s = await slides(c, qs);
      const summary = s.slideText[1]!;
      for (const k of v.kpis) assert.ok(summary.includes(k.cell.display.replace(/&/g, "&amp;")) || summary.includes(k.cell.display), `${c}: ${k.label} ${k.cell.display} missing from summary slide`);
      const ids = new Set(s.notes.flatMap((n) => [...n.matchAll(/mea:[A-Za-z0-9_.:\-]+/g)].map((m) => m[0])));
      assert.ok(ids.size > 20);
      const L = d.ledgers.get(c)!;
      for (const id of ids) assert.ok(L.idx.measures.has(id), `${c}: notes cite unknown measure ${id}`);
    }
  });

  test("estimated figures are labelled as such on the slides", async () => {
    const s = await slides("CUST001", "priority=emissions");
    assert.match(s.slideText[1]!, /Estimated/);
    assert.match(s.slideText[3]!, /Status: Estimated/);
  });

  test("unknown customer gives no deck", async () => {
    assert.equal(await deck(d, "NOPE", new URLSearchParams()), null);
  });
});
