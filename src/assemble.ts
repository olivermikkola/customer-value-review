import type { Claim, Driver, Measure, Observation } from "./model.ts";
import { buildClaims, buildDrivers, claimRecomputes } from "./claims.ts";
import { buildMeasures, measureRecomputes, type RefIndex } from "./ledger.ts";
import { buildObservations, enforceBudget } from "./review.ts";
import { generate, type Seed } from "./seed/generate.ts";
import { assert } from "./util.ts";

export interface Assembled {
  seed: Seed;
  idx: RefIndex;
  measures: Measure[];
  claims: Claim[];
  drivers: Driver[];
  observations: Observation[];
}

/**
 * Build everything and refuse to return if any number fails to recompute.
 *
 * This is the whole thesis in one function: if a measure cannot be reproduced
 * from its formula and inputs, the system does not start. Not "warns". Refuses.
 */
export function assemble(): Assembled {
  const seed = generate();
  const { idx, measures } = buildMeasures(seed);

  for (const m of measures) {
    assert(measureRecomputes(m, idx), `measure ${m.id} does not recompute from its inputs`);
  }

  const claims = buildClaims(idx, seed.customerId);
  for (const c of claims) {
    assert(claimRecomputes(c, idx), `claim ${c.id} does not recompute from its derivation`);
  }

  const drivers = buildDrivers(claims, idx);
  const observations = buildObservations(claims, drivers);
  enforceBudget(observations);

  return { seed, idx, measures, claims, drivers, observations };
}

export function measureById(measures: Measure[], id: string): Measure {
  const m = measures.find((x) => x.id === id);
  assert(m, `unknown measure: ${id}`);
  return m;
}
