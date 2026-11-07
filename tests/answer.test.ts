import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { intentTexts } from "../src/pack/answer.ts";
import { loadAll, reply, type Loaded } from "../src/pack/api.ts";
import { measureRecomputes } from "../src/ledger.ts";

let d: Loaded;
before(async () => {
  d = await loadAll();
});
const ask = (text: string, customer = "CUST001", sims?: Record<string, number>, force?: string) => reply(d, customer, text, new URLSearchParams(), sims, force)!.answer;

describe("answering without a language model", () => {
  test("a ranking question names sites with figures and says which end it chose", () => {
    const a = ask("Which site is worst on delivery?");
    assert.equal(a.intent, "site-rank");
    assert.match(a.sentences[0]!.text, /weakest sites are .*Pori/);
    assert.ok(a.sentences[0]!.cells.length >= 3);
  });

  test("a site is found without accents and answered in detail", () => {
    const a = ask("how is jyvaskyla doing");
    assert.equal(a.intent, "site-detail");
    assert.equal(a.title, "NorthStar Jyväskylä");
  });

  test("two sites are compared; one site with 'the others' is compared with all sites", () => {
    assert.match(ask("Helsinki vs Tampere").title, /Helsinki and Tampere/);
    assert.match(ask("how does Lahti compare to the rest").title, /against all sites/);
  });

  test("what the data cannot answer is refused, with the module that would", () => {
    const a = ask("How do we compare with other customers?");
    assert.equal(a.type, "no-data");
    assert.match(a.noData?.module?.name ?? "", /benchmarking/);
    assert.equal(ask("why did emissions go down").type, "no-data");
    assert.equal(ask("what did we pay per month").type, "no-data");
  });

  test("a question about nothing is not guessed at: the answer asks, and offers real questions", () => {
    const a = ask("banana");
    assert.equal(a.type, "clarify");
    assert.ok(a.followUps.length >= 3);
    assert.ok(a.followUps.every((f) => !/book|joke/i.test(f)));
  });

  test("a site question with no site asks which one", () => {
    const a = ask("how is this location doing");
    assert.notEqual(a.type, "answer", "must not invent a site");
  });

  test("the meaning model's scores can carry a question the words do not", () => {
    const sims = Object.fromEntries(intentTexts().map((t) => [t.id, 0.2]));
    sims["utilisation"] = 0.8;
    assert.equal(ask("are we paying for clothes nobody wears", "CUST001", sims).intent, "utilisation");
    assert.equal(ask("are we paying for clothes nobody wears", "CUST001", sims).read.via, "meaning and keywords");
  });

  test("a reader's choice overrides the guess", () => {
    const a = ask("how is service at Helsinki", "CUST001", undefined, "savings");
    assert.equal(a.intent, "savings");
  });

  test("a focus request carries the change to apply; Q3 and the baseline are read from the words", () => {
    const r = reply(d, "CUST001", "Focus on water and emissions for Q3 against home washing", new URLSearchParams())!;
    assert.equal(r.answer.intent, "tailor");
    assert.equal(r.answer.apply?.period, "Q3");
    assert.equal(r.answer.apply?.baseline, "B_HOME");
  });

  test("same question, same answer", () => {
    assert.deepEqual(ask("which site has the most surplus garments"), ask("which site has the most surplus garments"));
  });

  test("every answer works for every customer and period without a missing figure", () => {
    const qs = ["summary of the year", "how much water did we save", "emissions", "energy", "compare with home washing", "service performance", "which site is weakest", "are garments in use", "repairs", "textile waste", "what should we do", "discussion points", "how reliable is this", "how is it calculated", "what does this cover", "focus on service"];
    for (const c of ["CUST001", "CUST002", "CUST003"]) {
      for (const p of ["FY", "Q2"]) {
        for (const text of qs) {
          const r = reply(d, c, text, new URLSearchParams({ period: p }))!;
          assert.equal(r.answer.type, "answer", `${c} ${p} "${text}" → ${r.answer.intent}`);
          for (const s of r.answer.sentences) assert.ok(!/undefined|NaN|null/.test(s.text), `${c} ${p} "${text}": ${s.text}`);
        }
      }
    }
  });

  test("every figure in a sentence is one of its evidence cells, and every cell recomputes from the ledger", () => {
    const allowed = /\b(24|6|4|3|5|1 000|100|20|2025|FY|Q[1-4]|1st|2nd|3rd|\d+th|one)\b|±20 %|CUST\d+/g;
    for (const text of ["summary of the year", "how much water did we save", "which site is weakest", "how is Pori doing", "Pori vs Helsinki", "repairs", "textile waste", "are garments in use", "what should we do"]) {
      const a = ask(text);
      for (const s of a.sentences.filter((x) => x.kind === "fact")) {
        const shown = s.cells.map((c) => c.display).join(" | ");
        const nums = s.text.replace(allowed, "").match(/\d[\d,.]*/g) ?? [];
        for (const n of nums) assert.ok(shown.includes(n.replace(/[.,]$/, "")), `"${text}": ${n} in "${s.text}" is not in its cells (${shown})`);
        for (const c of s.cells) {
          const L = d.ledgers.get("CUST001")!;
          const m = L.idx.measures.get(c.id);
          assert.ok(m, `${c.id} is not a ledger measure`);
          assert.ok(measureRecomputes(m!, L.idx), `${c.id} does not recompute`);
        }
      }
    }
  });
});
