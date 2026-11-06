import type { Claim, Driver, Observation } from "./model.ts";
import { round } from "./util.ts";

/**
 * Which claims are worth a customer's attention.
 *
 * `rank = materiality × novelty × actionability` and a hard budget of 3.
 * The budget is a product decision, not a technical one: a review that takes
 * more than 90 seconds to read is a review nobody reads.
 */
interface Profile {
  severity: Observation["severity"];
  novelty: number;
  actionability: number;
}

const PROFILES: Record<string, Profile> = {
  "clm:water-intensity-up": { severity: "act", novelty: 1.0, actionability: 0.9 },
  "clm:loss-cost-up": { severity: "act", novelty: 1.0, actionability: 0.95 },
  "clm:repair-rate-up": { severity: "info", novelty: 0.6, actionability: 0.3 },
  "clm:water-volume-up": { severity: "watch", novelty: 0.4, actionability: 0.7 },
  "clm:cost-up": { severity: "watch", novelty: 0.3, actionability: 0.5 },
  "clm:co2-up": { severity: "watch", novelty: 0.3, actionability: 0.4 },
  "clm:mat-up": { severity: "info", novelty: 0.2, actionability: 0.2 },
  "clm:linen-up": { severity: "info", novelty: 0.2, actionability: 0.2 },
  "clm:water-avoided": { severity: "info", novelty: 0.5, actionability: 0.1 },
  "clm:water-attribution": { severity: "info", novelty: 0.1, actionability: 0.1 },
  "clm:water-unattributed": { severity: "info", novelty: 0.1, actionability: 0.1 },
};

const DEFAULT_PROFILE: Profile = { severity: "info", novelty: 0.1, actionability: 0.1 };

export const CLAIM_BUDGET = 3;

/**
 * Same truth, different lens. This is Lindström's "adapt to what a customer
 * cares about" made concrete: the numbers do not change, only which of them
 * lead. A CFO and a sustainability lead read the same review and see a
 * different first paragraph — with identical provenance underneath.
 */
export type Lens = "balanced" | "sustainability" | "cost";

const LENS_WEIGHT: Record<Lens, Record<string, number>> = {
  balanced: {},
  sustainability: {
    water_intensity: 1.6,
    water_m3: 1.4,
    co2_kg: 1.5,
    water_avoided_m3: 1.3,
    loss_cost_eur: 0.7,
    cost_eur: 0.8,
  },
  cost: {
    loss_cost_eur: 1.6,
    cost_eur: 1.5,
    water_intensity: 0.6,
    water_m3: 0.6,
    co2_kg: 0.6,
  },
};

export function buildObservations(
  claims: Claim[],
  drivers: Driver[],
  budget = CLAIM_BUDGET,
  lens: Lens = "balanced",
): Observation[] {
  const weights = LENS_WEIGHT[lens];
  const observations = claims
    .map((claim) => {
      const profile = PROFILES[claim.id] ?? DEFAULT_PROFILE;
      const weight = weights[claim.subject.metricId] ?? 1;
      const rank = round(claim.materiality * profile.novelty * profile.actionability * weight, 3);
      return {
        id: `obs:${claim.id.replace(/^clm:/, "")}`,
        claimId: claim.id,
        driverIds: drivers.filter((d) => d.claimId === claim.id).map((d) => d.id),
        severity: profile.severity,
        headline: claim.label,
        rank,
        materiality: claim.materiality,
        novelty: profile.novelty,
        actionability: profile.actionability,
      } satisfies Observation;
    })
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));

  return observations.slice(0, budget);
}

/** V10 — the claim budget. */
export function enforceBudget(observations: Observation[], budget = CLAIM_BUDGET): void {
  if (observations.length > budget) {
    throw new Error(
      `BUDGET_EXCEEDED: ${observations.length} havaintoa, katto on ${budget}`,
    );
  }
}
