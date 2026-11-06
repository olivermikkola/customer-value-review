import assert from "node:assert/strict";
import test from "node:test";
import { generate } from "../src/seed/generate.ts";
import { buildMeasures, measureRecomputes } from "../src/ledger.ts";
import { buildClaims, buildDrivers, claimRecomputes } from "../src/claims.ts";
import { checksum, sum } from "../src/util.ts";

test("seed is deterministic: two runs produce identical bytes", () => {
  const a = generate();
  const b = generate();
  assert.equal(checksum(a.sources), checksum(b.sources));
  assert.equal(checksum(a.factors), checksum(b.factors));
});

test("planted totals hold exactly", () => {
  const seed = generate();
  const { measures } = buildMeasures(seed);
  const v = (id: string) => {
    const m = measures.find((x) => x.id === id);
    assert.ok(m, `missing measure ${id}`);
    return m.value;
  };

  assert.equal(v("mea:linen_kg:2024-Q3"), 36_100);
  assert.equal(v("mea:linen_kg:2025-Q3"), 38_400);
  assert.equal(v("mea:water_m3:2024-Q3"), 3_472);
  assert.equal(v("mea:water_m3:2025-Q3"), 4_210);
  assert.equal(v("mea:mat_kg:2024-Q3"), 8_900);
  assert.equal(v("mea:mat_kg:2025-Q3"), 13_000);
});

test("per-site linen sums to the customer total", () => {
  const seed = generate();
  const { measures } = buildMeasures(seed);
  for (const period of ["2024-Q3", "2025-Q3"]) {
    const total = measures.find((m) => m.id === `mea:linen_kg:${period}`)!.value;
    const perSite = sum(
      seed.sites.map(
        (s) => measures.find((m) => m.id === `mea:linen_kg:${period}:${s.key}`)!.value,
      ),
    );
    assert.equal(perSite, total, `${period}: site sum != total`);
  }
});

test("every measure recomputes from its own formula and inputs", () => {
  const seed = generate();
  const { idx, measures } = buildMeasures(seed);
  for (const m of measures) {
    assert.ok(measureRecomputes(m, idx), `${m.id} does not recompute`);
  }
});

test("every claim recomputes from its derivation", () => {
  const seed = generate();
  const { idx } = buildMeasures(seed);
  const claims = buildClaims(idx, seed.customerId);
  for (const c of claims) {
    assert.ok(claimRecomputes(c, idx), `${c.id} does not recompute`);
  }
});

test("the 53 % attribution is data, not hard-coded", () => {
  const seed = generate();
  const { idx } = buildMeasures(seed);
  const claims = buildClaims(idx, seed.customerId);
  const attribution = claims.find((c) => c.id === "clm:water-attribution")!;
  const attributable = idx.measures.get("mea:water_attributable_m3:2025-Q3")!.value;
  const unattributed = idx.measures.get("mea:water_unattributed_m3:2025-Q3")!.value;
  const delta = idx.measures.get("mea:water_delta_m3:2024-Q3->2025-Q3")!.value;

  assert.equal(delta, 738);
  assert.ok(Math.abs(attribution.stated.value - 53.43) < 0.01);
  assert.ok(Math.abs(attributable - 394.33) < 0.01);
  assert.ok(Math.abs(attributable + unattributed - delta) < 1e-9);
});

test("a driver may be left without an attributed share on purpose", () => {
  const seed = generate();
  const { idx } = buildMeasures(seed);
  const claims = buildClaims(idx, seed.customerId);
  const drivers = buildDrivers(claims, idx);
  const partial = drivers.find((d) => d.id === "drv:partial-loads")!;
  assert.equal(partial.attributedShare, null);
  assert.equal(partial.method, "hypothesis");
});

test("confidence is inherited, not asserted: the avoided-water claim is proxy", () => {
  const seed = generate();
  const { idx } = buildMeasures(seed);
  const claims = buildClaims(idx, seed.customerId);
  const avoided = claims.find((c) => c.id === "clm:water-avoided")!;
  assert.equal(avoided.confidence, "proxy");
});
