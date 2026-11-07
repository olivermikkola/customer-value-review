/**
 * LANKA — provenance model.
 *
 * Rule of the whole system: a number shown to a human is always a Claim, and a
 * Claim always points at Measures, and a Measure always points at Sources or
 * Factors. There is no path from "a sentence on screen" to "nowhere".
 */

export type Confidence = "measured" | "estimated" | "proxy";

/** Lower is better. A claim inherits the worst confidence of its inputs. */
export const CONFIDENCE_RANK: Record<Confidence, number> = {
  measured: 0,
  estimated: 1,
  proxy: 2,
};

export function worstConfidence(...cs: Confidence[]): Confidence {
  return cs.reduce((a, b) => (CONFIDENCE_RANK[a] >= CONFIDENCE_RANK[b] ? a : b));
}

/**
 * What kind of number this is, separate from how much to trust it. Everything
 * in the hackathon pack is synthetic, so a "measured" confidence alone would
 * mislead; `status` says what was done to the numbers on the way here.
 * Ordered: a result carries the highest status of anything it was built from.
 */
export type DataStatus = "synthetic" | "calculated" | "allocated" | "estimated";
export const STATUS_RANK: Record<DataStatus, number> = {
  synthetic: 0,
  calculated: 1,
  allocated: 2,
  estimated: 3,
};
export function worstStatus(...ss: DataStatus[]): DataStatus {
  return ss.reduce((a, b) => (STATUS_RANK[a] >= STATUS_RANK[b] ? a : b));
}

export type Period = { from: string; to: string };

export type Scope = {
  customerId: string;
  siteId?: string;
  laundryId?: string;
  productId?: string;
  /** Free-form slice such as a repair type, when the metric needs one. */
  slice?: string;
  serviceId?: string;
};

export type SourceKind =
  | "meter"
  | "delivery"
  | "pickup"
  | "wash_batch"
  | "repair"
  | "loss"
  | "assignment"
  | "invoice"
  | "hr"
  | "service_activity"
  | "repair_record"
  | "service_cycles"
  | "laundry_resource"
  | "waste_record";

/** A raw fact. Immutable: `checksum` is the hash of its canonical content. */
export interface Source {
  id: string;
  kind: SourceKind;
  siteId?: string;
  serviceId?: string;
  period: Period;
  value: number;
  unit: string;
  granularity: "event" | "daily" | "period";
  ref: string;
  ingestedAt: string;
  checksum: string;
  /** The pack's own data_status label for the row, verbatim. */
  dataStatus?: string;
}

/**
 * A coefficient with a source and a version. Never resolved as "latest":
 * a review pins the version it used, so an old review never silently changes.
 */
export interface Factor {
  id: string;
  name: string;
  value: number;
  unit: string;
  version: string;
  validFrom: string;
  validTo?: string;
  sourceRef: string;
  kind: Confidence;
  /** Defaults to "estimated": a factor is an assumption unless said otherwise. */
  status?: DataStatus;
}

/**
 * A computed quantity. `formula` is evaluated against `bindings`, which map
 * variable names to Source or Measure ids. Recompute is therefore always
 * possible without trusting whoever built the measure.
 */
export interface Measure {
  id: string;
  metricId: string;
  label: string;
  scope: Scope;
  period: Period;
  value: number;
  unit: string;
  formula: string;
  bindings: Record<string, string>;
  /** Source or Measure ids used, i.e. Object.values(bindings). */
  inputs: string[];
  /** Factor ids in `id@version` form. Pinned, never floating. */
  factors: string[];
  confidence: Confidence;
  status?: DataStatus;
}

/** How a Claim's stated value is derived. Deterministic, no LLM involved. */
export type Derivation =
  | { kind: "level"; measureId: string }
  | { kind: "change"; fromMeasureId: string; toMeasureId: string }
  /** Same unit both sides, difference in the unit itself (e.g. percentage points). */
  | { kind: "delta"; fromMeasureId: string; toMeasureId: string }
  | { kind: "comparison"; measureId: string; benchmarkMeasureId: string };

export interface Claim {
  id: string;
  kind: "change" | "level" | "comparison" | "avoided_impact" | "benchmark";
  /** Short human label, used as the observation headline. */
  label: string;
  subject: { metricId: string; scope: Scope };
  measureIds: string[];
  derivation: Derivation;
  stated: { value: number; unit: string; direction: "up" | "down" | "flat" };
  benchmarkMeasureId?: string;
  confidence: Confidence;
  /** 0..1. How much EUR/CO2 this moves. Drives the claim budget. */
  materiality: number;
  /** Denominator for a change claim, so "53 % of the rise" is expressible. */
  context?: { comparedTo: string };
}

/**
 * A cause link. Deliberately *not* a calculation: it is a curated edge.
 * `attributedShare` is allowed to be null, and is allowed to be < 1.
 * A system forced to explain 100 % of everything is a system that lies.
 */
export interface Driver {
  id: string;
  claimId: string;
  label: string;
  causeRef: string;
  attributedShare: number | null;
  /** Absolute amount explained, in the claim's input unit (e.g. m3). */
  attributedAmount: number | null;
  method: "measured" | "modeled" | "hypothesis";
  evidenceClaimIds: string[];
}

export interface Observation {
  id: string;
  claimId: string;
  driverIds: string[];
  severity: "info" | "watch" | "act";
  headline: string;
  rank: number;
  materiality: number;
  novelty: number;
  actionability: number;
}

export interface Recommendation {
  id: string;
  observationId: string;
  title: string;
  action: string;
  /** Why this option and not the others — one sentence, no hedging. */
  rationale: string;
  expectedImpact: { metricId: string; delta: number; unit: string }[];
  effort: "low" | "medium" | "high";
  confidence: Confidence;
  /** What gets worse if you take this. Never empty in a real trade-off. */
  tradeoffs: { metricId: string; delta: number; unit: string; note: string }[];
  /** False when this dataset cannot measure the outcome — say so, don't guess. */
  measurable: boolean;
  baselineMeasureId?: string;
  resultMeasureId?: string;
  target?: {
    metricId: string;
    delta: number;
    unit: string;
    betterWhen: "lower" | "higher";
  };
}

export interface Commitment {
  id: string;
  recommendationId: string;
  acceptedBy: "customer" | "account_team" | "both";
  acceptedAt: string;
  baselineMeasureId: string;
  target: { metricId: string; delta: number; unit: string; betterWhen: "lower" | "higher" };
  reviewDate: string;
  status: "open" | "measured" | "missed";
  resultMeasureId?: string;
}

/** The point of the whole loop: did the thing we agreed actually work? */
export interface CommitmentProgress {
  actualDelta: number;
  targetDelta: number;
  unit: string;
  met: boolean;
  baselineValue: number;
  resultValue: number;
  /** How the result is described in the next review. */
  verdict: "measured" | "missed" | "open";
}

export interface Ledger {
  customerId: string;
  sources: Source[];
  factors: Factor[];
  measures: Measure[];
  claims: Claim[];
  drivers: Driver[];
}
