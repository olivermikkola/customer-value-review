import { test } from "node:test";
import assert from "node:assert/strict";
import { assemble } from "../src/assemble.ts";
import { gate, slotify, splitSentences, tasksFor } from "../src/llm.ts";
import type { Ctx } from "../src/validator.ts";

// The model layer without a model: what any model may write, and what the gate does with it.

const a = assemble();
const ctx: Ctx = { claims: new Map(a.claims.map((c) => [c.id, c])), measures: a.idx.measures, drivers: a.drivers };
const water = tasksFor(a.claims, a.drivers, "balanced").find((t) => t.claimId === "clm:water-volume-up")!;

const verdict = (raw: string, task = water) => {
  const g = gate(raw, ctx, [], task);
  return g.accepted.length ? "ok" : g.rejected[0]!.code;
};

test("a copied value becomes its claim, whatever the decimal mark or unit word", () => {
  assert.equal(slotify("Kulutus nousi 21,3 %.", ctx, water.claimIds), "Kulutus nousi [[clm:water-volume-up]].");
  assert.equal(slotify("Kulutus nousi 21.3 prosenttia.", ctx, water.claimIds), "Kulutus nousi [[clm:water-volume-up]].");
});

test("a rounded or invented number is rejected, not matched", () => {
  assert.equal(verdict("Veden kokonaiskulutus nousi 22 %."), "UNSOURCED_NUMBER");
  assert.equal(verdict("Veden kokonaiskulutus nousi 21,4 %."), "UNSOURCED_NUMBER");
});

test("another claim's equal value cannot be borrowed outside its task", () => {
  // clm:co2-up also reads 21,3 %, but it is not in this task's scope: the copy maps to water only.
  assert.equal(slotify("Päästöt nousivat 21,3 %.", ctx, water.claimIds), "Päästöt nousivat [[clm:water-volume-up]].");
  assert.equal(verdict("Päästöt nousivat 21,3 %."), "SUBJECT_MISMATCH");
});

test("a number next to the wrong subject is rejected", () => {
  assert.equal(verdict("Palvelulaskutus nousi 21,3 %."), "SUBJECT_MISMATCH");
});

test("filler without a claim or a recorded cause is rejected", () => {
  assert.equal(verdict("Tämä on hyvä."), "NO_CLAIM");
});

test("inflected cause words are caught", () => {
  assert.equal(verdict("Kulutus nousi johtuen sääolosuhteista."), "UNSUPPORTED_CAUSAL");
  assert.equal(gate("{{drv:partial-loads}} aiheuttivat nousun.", ctx).rejected[0]?.code, "UNSUPPORTED_CAUSAL");
});

test("a confirmed cause may be named; a hypothesis may only be placed in time", () => {
  assert.equal(gate("{{drv:tapiola-loss}} aiheuttivat katoamisen kustannuksen nousun.", ctx).accepted.length, 1);
  assert.equal(
    verdict("Loput 344 m³ ajoittuu samaan aikaan kuin Espoon pesulan vajaat kuormat, elokuu 2025; syytä ei ole vahvistettu."),
    "ok",
  );
});

test("a retry that repeats an accepted sentence does not count as a duplicate", () => {
  const first = gate("Veden kokonaiskulutus nousi 21,3 %.", ctx, [], water);
  const again = gate("Veden kokonaiskulutus nousi 21,3 %.", ctx, first.kept, water);
  assert.equal(again.rejected.length, 0);
  assert.equal(again.accepted.length, 1);
});

test("every template fallback passes the gate in every lens", () => {
  for (const lens of ["balanced", "sustainability", "cost"] as const) {
    let keep: string[] = [];
    for (const t of tasksFor(a.claims, a.drivers, lens)) {
      const g = gate(t.fallback, ctx, keep);
      assert.equal(g.rejected.length, 0, `${lens}: ${t.fallback}`);
      keep = g.kept;
    }
  }
});

test("list markers and run-on lines are split into sentences", () => {
  assert.deepEqual(splitSentences("1. Eka lause. Toka lause.\n- Kolmas"), ["Eka lause.", "Toka lause.", "Kolmas"]);
});
