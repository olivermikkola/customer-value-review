import assert from "node:assert/strict";
import test from "node:test";
import { assemble } from "../src/assemble.ts";
import { SAMPLE_NARRATIVE, SAMPLE_REJECTIONS } from "../src/narrative.ts";
import { render, validateNarrative, validateSentence, type Ctx } from "../src/validator.ts";
import { buildObservations, CLAIM_BUDGET, enforceBudget } from "../src/review.ts";

function ctxOf(): Ctx {
  const { idx, claims, drivers } = assemble();
  return { claims: new Map(claims.map((c) => [c.id, c])), measures: idx.measures, drivers };
}

test("the accepted narrative passes every rule", () => {
  const result = validateNarrative(SAMPLE_NARRATIVE, ctxOf());
  assert.deepEqual(result.rejected, []);
  assert.equal(result.accepted.length, SAMPLE_NARRATIVE.length);
});

test("rendered numbers come from claims, never from the model", () => {
  const ctx = ctxOf();
  const out = render("Vesi nousi [[clm:water-intensity-up]].", ctx);
  assert.equal(out.text, "Vesi nousi 14,0 %.");
  assert.deepEqual(out.claimIds, ["clm:water-intensity-up"]);
});

test("a hand-typed number is rejected", () => {
  const v = validateSentence("Vedenkulutus nousi 21,3 prosenttia.", ctxOf());
  assert.equal(v.ok, false);
  assert.equal(v.code, "UNSOURCED_NUMBER");
});

test("causal language without a Driver edge is rejected", () => {
  const v = validateSentence("Pyykki lisääntyi koska mattoja pestiin enemmän [[clm:linen-up]].", ctxOf());
  assert.equal(v.ok, false);
  assert.equal(v.code, "UNSUPPORTED_CAUSAL");
});

test("causal language WITH a Driver edge is accepted", () => {
  const v = validateSentence(
    "Mattotiheyden nosto selittää noin [[clm:water-attribution:0]] noususta.",
    ctxOf(),
  );
  assert.equal(v.ok, true);
});

test("superlative without a benchmark is rejected", () => {
  const v = validateSentence(
    "Vedenkulutus on merkittävästi parempi kuin muilla [[clm:water-intensity-up]].",
    ctxOf(),
  );
  assert.equal(v.ok, false);
  assert.equal(v.code, "UNSUPPORTED_SUPERLATIVE");
});

test("unknown slot is rejected", () => {
  const v = validateSentence("Vesi nousi [[clm:does-not-exist]].", ctxOf());
  assert.equal(v.ok, false);
  assert.equal(v.code, "UNKNOWN_SLOT");
});

test("a tampered claim value is caught by recompute", () => {
  const ctx = ctxOf();
  const original = ctx.claims.get("clm:water-intensity-up")!;
  ctx.claims.set("clm:water-intensity-up", {
    ...original,
    stated: { ...original.stated, value: 14.0 },
  });
  const v = validateSentence("Vesi nousi [[clm:water-intensity-up]].", ctx);
  assert.equal(v.ok, false);
  assert.equal(v.code, "RECOMPUTE_MISMATCH");
});

test("inflated confidence is caught", () => {
  const ctx = ctxOf();
  const original = ctx.claims.get("clm:water-avoided")!;
  ctx.claims.set("clm:water-avoided", { ...original, confidence: "measured" });
  const v = validateSentence("Vältetty vesi oli [[clm:water-avoided]].", ctx);
  assert.equal(v.ok, false);
  assert.equal(v.code, "CONFIDENCE_INFLATED");
});

test("every rejection sample fails for the reason we claim", () => {
  const ctx = ctxOf();
  const codes = SAMPLE_REJECTIONS.map((s) => {
    const v = validateSentence(s, ctx);
    assert.equal(v.ok, false, `expected rejection: ${s}`);
    return v.code;
  });
  assert.deepEqual(codes, [
    "UNSOURCED_NUMBER",
    "UNSUPPORTED_CAUSAL",
    "UNSUPPORTED_SUPERLATIVE",
    "UNKNOWN_SLOT",
  ]);
});

test("the claim budget holds and is enforced", () => {
  const { claims, drivers } = assemble();
  const obs = buildObservations(claims, drivers);
  assert.equal(obs.length, CLAIM_BUDGET);
  enforceBudget(obs);
  assert.throws(() => enforceBudget([...obs, ...obs]), /BUDGET_EXCEEDED/);
});

test("lenses reorder the same claims without changing them", () => {
  const { claims, drivers } = assemble();
  const balanced = buildObservations(claims, drivers, 3, "balanced");
  const sustainability = buildObservations(claims, drivers, 3, "sustainability");
  const cost = buildObservations(claims, drivers, 3, "cost");

  assert.equal(balanced[0]!.claimId, "clm:loss-cost-up");
  assert.equal(sustainability[0]!.claimId, "clm:water-intensity-up");
  assert.equal(cost[0]!.claimId, "clm:loss-cost-up");
  // same set, different order
  assert.deepEqual(
    new Set(balanced.map((o) => o.claimId)),
    new Set(sustainability.map((o) => o.claimId)),
  );
});
