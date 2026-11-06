import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble } from "../src/assemble.ts";
import { askTask, matchQuestion } from "../src/ask.ts";
import { gate } from "../src/llm.ts";
import type { Ctx } from "../src/validator.ts";

// Question → claims is code, not model: these are the questions a KAM would ask.

const a = assemble();
const ctx: Ctx = { claims: new Map(a.claims.map((c) => [c.id, c])), measures: a.idx.measures, drivers: a.drivers };
const top = (q: string) => matchQuestion(q, a.claims, a.drivers).claimIds[0];

test("everyday wording finds the right claim", () => {
  assert.equal(top("Miksi vedenkulutus nousi?"), "clm:water-volume-up");
  assert.equal(top("Miksi laskumme nousi?"), "clm:cost-up");
  assert.equal(top("Paljonko vettä säästettiin?"), "clm:water-avoided");
  assert.equal(top("Miten päästöt kehittyivät?"), "clm:co2-up");
  assert.equal(top("Korjataanko vaatteita enemmän?"), "clm:repair-rate-up");
});

test("naming a place finds the cause recorded there, and the claim it explains", () => {
  const m = matchQuestion("Mitä Tapiolassa tapahtui?", a.claims, a.drivers);
  assert.deepEqual(m.driverIds, ["drv:tapiola-loss"]);
  assert.equal(m.claimIds[0], "clm:loss-cost-up");
});

test("'why' brings the recorded causes and the numbers behind them", () => {
  const r = askTask("Miksi vedenkulutus nousi?", a.claims, a.drivers);
  assert.ok(r.task);
  assert.ok(r.task.driverIds.includes("drv:mat-frequency"));
  assert.ok(r.task.driverIds.includes("drv:partial-loads"));
  assert.ok(r.task.claimIds.includes("clm:water-attribution"));
  assert.match(r.task.user, /EI vahvistettu/);
});

test("comparisons and unknown topics get an honest no-data answer, not a guess", () => {
  const cmp = askTask("Ollaanko me parempia kuin muut?", a.claims, a.drivers);
  assert.equal(cmp.task, null);
  assert.match(cmp.task === null ? cmp.reason : "", /vertaisdata/);
  const none = askTask("Mikä on toimitusvarmuus?", a.claims, a.drivers);
  assert.equal(none.task, null);
});

test("the model never sees raw data, only the matched claims' finished values", () => {
  const r = askTask("Mitä Tapiolassa tapahtui?", a.claims, a.drivers);
  assert.ok(r.task);
  assert.match(r.task.user, /47,2 %/);
  assert.doesNotMatch(r.task.user, /21,3 %/);
});

test("every ask fallback passes the gate", () => {
  for (const q of ["Miksi vedenkulutus nousi?", "Mitä Tapiolassa tapahtui?", "Miksi laskumme nousi?", "Paljonko vettä säästettiin?"]) {
    const r = askTask(q, a.claims, a.drivers);
    assert.ok(r.task, q);
    const g = gate(r.task.fallbacks.join("\n"), ctx);
    assert.equal(g.rejected.length, 0, `${q}: ${g.rejected.map((x) => x.code).join(", ")}`);
  }
});

test("a cause the data does not hold is stopped (the live demo moment)", () => {
  const r = askTask("Miksi laskumme nousi?", a.claims, a.drivers);
  assert.ok(r.task);
  const g = gate("Palvelulaskutus nousi 10,1 %, koska palvelun laatu parani.", ctx, [], r.task);
  assert.equal(g.rejected[0]?.code, "UNSUPPORTED_CAUSAL");
});

// Semantic routing (src/ask.ts + web/semantic.js): fake similarities, real rules.
const near = (id: string) => Object.fromEntries(
  ["clm:water-intensity-up", "clm:water-volume-up", "clm:linen-up", "clm:mat-up", "clm:cost-up", "clm:loss-cost-up",
    "clm:repair-rate-up", "clm:co2-up", "clm:water-avoided", "clm:water-q4"].map((x) => [x, x === id ? 0.9 : 0.5]),
);

test("meaning orders the topics the words found", () => {
  const m = matchQuestion("Miten vedenkulutus käyttäytyi joulukuussa?", a.claims, a.drivers, near("clm:water-q4"));
  assert.equal(m.claimIds[0], "clm:water-q4");
  assert.ok(m.claimIds.includes("clm:water-volume-up"));
});

test("meaning never brings in a topic the question did not mention", () => {
  // Measured in the browser: the embedder ranked Q4 water closest to a question about the bill.
  const m = matchQuestion("Miksi laskumme nousi?", a.claims, a.drivers, near("clm:water-q4"));
  assert.deepEqual(m.claimIds, ["clm:cost-up"]);
});

test("an off-topic question stays unanswered however close the embedding says it is", () => {
  const r = askTask("Mikä on toimitusvarmuus?", a.claims, a.drivers, near("clm:loss-cost-up"));
  assert.equal(r.task, null);
});

test("a named cause beats the embedding: Tapiola means the Tapiola losses", () => {
  const m = matchQuestion("Mitä Tapiolassa tapahtui?", a.claims, a.drivers, near("clm:water-volume-up"));
  assert.deepEqual(m.claimIds, ["clm:loss-cost-up"]);
});

test("without similarities the word lists decide alone (embedder not loaded yet)", () => {
  assert.deepEqual(
    matchQuestion("Miksi laskumme nousi?", a.claims, a.drivers).claimIds,
    matchQuestion("Miksi laskumme nousi?", a.claims, a.drivers, undefined).claimIds,
  );
});
