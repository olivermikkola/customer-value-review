import type { Claim, Derivation, Driver, Measure } from "./model.ts";
import { worstConfidence } from "./model.ts";
import { assert } from "./util.ts";
import type { RefIndex } from "./ledger.ts";

function measure(id: string, idx: RefIndex): Measure {
  const m = idx.measures.get(id);
  assert(m, `claim references unknown measure: ${id}`);
  return m;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/** Deterministic. This is the number the validator compares the LLM against. */
export function recomputeClaim(claim: Claim, idx: RefIndex): number {
  const d = claim.derivation;
  switch (d.kind) {
    case "level":
      return measure(d.measureId, idx).value;
    case "change": {
      const from = measure(d.fromMeasureId, idx).value;
      const to = measure(d.toMeasureId, idx).value;
      assert(from !== 0, `change claim ${claim.id}: baseline is zero`);
      return (to / from - 1) * 100;
    }
    case "delta":
      return measure(d.toMeasureId, idx).value - measure(d.fromMeasureId, idx).value;
    case "comparison": {
      const m = measure(d.measureId, idx).value;
      const b = measure(d.benchmarkMeasureId, idx).value;
      assert(b !== 0, `comparison claim ${claim.id}: benchmark is zero`);
      return (m / b - 1) * 100;
    }
  }
}

export function claimRecomputes(claim: Claim, idx: RefIndex, eps = 1e-6): boolean {
  return Math.abs(recomputeClaim(claim, idx) - claim.stated.value) <= eps;
}

interface Spec {
  id: string;
  kind: Claim["kind"];
  metricId: string;
  label: string;
  derivation: Derivation;
  unit: string;
  /** |value| at which this claim is considered fully material (1.0). */
  scale: number;
  /** Lower quality than the inputs would allow -> rejected by V6. */
  confidence?: Claim["confidence"];
  benchmarkMeasureId?: string;
}

function materialityOf(spec: Spec, value: number): number {
  return clamp01(Math.abs(value) / spec.scale);
}

function directionOf(value: number): Claim["stated"]["direction"] {
  if (Math.abs(value) < 0.05) return "flat";
  return value > 0 ? "up" : "down";
}

function build(spec: Spec, idx: RefIndex, customerId: string): Claim {
  const value = recomputeClaim(
    {
      id: spec.id,
      kind: spec.kind,
      label: spec.label,
      subject: { metricId: spec.metricId, scope: { customerId: "" } },
      measureIds: [],
      derivation: spec.derivation,
      stated: { value: 0, unit: spec.unit, direction: "flat" },
      confidence: "measured",
      materiality: 0,
    },
    idx,
  );

  const d = spec.derivation;
  const involved: Measure[] = [];
  if ("measureId" in d) involved.push(measure(d.measureId, idx));
  if ("fromMeasureId" in d) involved.push(measure(d.fromMeasureId, idx));
  if ("toMeasureId" in d) involved.push(measure(d.toMeasureId, idx));
  if ("benchmarkMeasureId" in d) involved.push(measure(d.benchmarkMeasureId, idx));

  const confidence =
    spec.confidence ?? worstConfidence(...involved.map((m) => m.confidence));

  return {
    id: spec.id,
    kind: spec.kind,
    label: spec.label,
    subject: { metricId: spec.metricId, scope: { customerId } },
    measureIds: involved.map((m) => m.id),
    derivation: d,
    stated: { value, unit: spec.unit, direction: directionOf(value) },
    benchmarkMeasureId: spec.benchmarkMeasureId,
    confidence,
    materiality: materialityOf(spec, value),
    context: { comparedTo: "2024-Q3" },
  };
}

const SPECS: Spec[] = [
  {
    id: "clm:water-intensity-up",
    kind: "change",
    metricId: "water_intensity",
    label: "Veden ominaiskulutus",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:water_intensity:2024-Q3",
      toMeasureId: "mea:water_intensity:2025-Q3",
    },
    unit: "%",
    scale: 30,
  },
  {
    id: "clm:water-volume-up",
    kind: "change",
    metricId: "water_m3",
    label: "Veden kokonaiskulutus",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:water_m3:2024-Q3",
      toMeasureId: "mea:water_m3:2025-Q3",
    },
    unit: "%",
    scale: 40,
  },
  {
    id: "clm:linen-up",
    kind: "change",
    metricId: "linen_kg",
    label: "Pesty pyykki",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:linen_kg:2024-Q3",
      toMeasureId: "mea:linen_kg:2025-Q3",
    },
    unit: "%",
    scale: 20,
  },
  {
    id: "clm:mat-up",
    kind: "change",
    metricId: "mat_kg",
    label: "Mattopyykki",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:mat_kg:2024-Q3",
      toMeasureId: "mea:mat_kg:2025-Q3",
    },
    unit: "%",
    scale: 60,
  },
  {
    id: "clm:cost-up",
    kind: "change",
    metricId: "cost_eur",
    label: "Palvelulaskutus",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:cost_eur:2024-Q3",
      toMeasureId: "mea:cost_eur:2025-Q3",
    },
    unit: "%",
    scale: 25,
  },
  {
    id: "clm:loss-cost-up",
    kind: "change",
    metricId: "loss_cost_eur",
    label: "Katoamisen kustannus",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:loss_cost_eur:2024-Q3",
      toMeasureId: "mea:loss_cost_eur:2025-Q3",
    },
    unit: "%",
    scale: 50,
  },
  {
    id: "clm:repair-rate-up",
    kind: "change",
    metricId: "repair_rate",
    label: "Korjaussuhde",
    derivation: {
      kind: "delta",
      fromMeasureId: "mea:repair_rate:2024-Q3",
      toMeasureId: "mea:repair_rate:2025-Q3",
    },
    unit: "pp",
    scale: 10,
  },
  {
    id: "clm:co2-up",
    kind: "change",
    metricId: "co2_kg",
    label: "Veden käsittelyn päästöt",
    derivation: {
      kind: "change",
      fromMeasureId: "mea:co2_kg:2024-Q3",
      toMeasureId: "mea:co2_kg:2025-Q3",
    },
    unit: "%",
    scale: 40,
  },
  {
    // The "value" claim. Confidence is proxy because the counterfactual is.
    id: "clm:water-avoided",
    kind: "avoided_impact",
    metricId: "water_avoided_m3",
    label: "Vältetty vesi vs. oma pesula",
    derivation: { kind: "level", measureId: "mea:water_avoided_m3:2025-Q3" },
    unit: "m3",
    scale: 20000,
  },
  {
    // How much of the rise the mat change explains. Never 100.
    id: "clm:water-attribution",
    kind: "level",
    metricId: "water_attribution_share",
    label: "Mattotiheyden selitysosuus",
    derivation: { kind: "level", measureId: "mea:water_attribution_share:2025-Q3" },
    unit: "%",
    scale: 100,
  },
  {
    id: "clm:water-unattributed",
    kind: "level",
    metricId: "water_unattributed_m3",
    label: "Selittämätön vesi",
    derivation: { kind: "level", measureId: "mea:water_unattributed_m3:2025-Q3" },
    unit: "m3",
    scale: 1000,
  },
];

export function buildClaims(idx: RefIndex, customerId: string): Claim[] {
  return SPECS.map((s) => build(s, idx, customerId));
}

export function claimById(claims: Claim[], id: string): Claim {
  const c = claims.find((x) => x.id === id);
  assert(c, `unknown claim: ${id}`);
  return c;
}

/**
 * Cause links. Only these may be spoken about causally.
 * Note `attributedShare` is never forced to 1: `partial-loads` is deliberately
 * left with a null share, because we do not know it.
 */
export function buildDrivers(claims: Claim[], idx: RefIndex): Driver[] {
  const sharePct = measure("mea:water_attribution_share:2025-Q3", idx).value;
  const attributable = measure("mea:water_attributable_m3:2025-Q3", idx).value;
  const unattributed = measure("mea:water_unattributed_m3:2025-Q3", idx).value;

  const lossDelta =
    measure("mea:loss_cost_eur:2025-Q3", idx).value -
    measure("mea:loss_cost_eur:2024-Q3", idx).value;
  const tapiolaLossDelta =
    measure("mea:loss_items:2025-Q3:tapiola", idx).value -
    measure("mea:loss_items:2024-Q3:tapiola", idx).value;
  const replacementCost = idx.factors.get("fac:garment-replacement-cost@v2");
  assert(replacementCost, "missing factor fac:garment-replacement-cost@v2");
  const tapiolaLossCostDelta = tapiolaLossDelta * replacementCost.value;

  return [
    {
      id: "drv:mat-frequency",
      claimId: "clm:water-volume-up",
      label: "Mattotiheyden nosto 2 → 3 krt/vko (Espoo, Vantaa)",
      causeRef: "event:mat-frequency-increase@site:espoo,site:vantaa@2025-07-01",
      attributedShare: sharePct / 100,
      attributedAmount: attributable,
      method: "measured",
      evidenceClaimIds: ["clm:mat-up", "clm:water-attribution"],
    },
    {
      id: "drv:partial-loads",
      claimId: "clm:water-volume-up",
      label: "Espoon pesulan vajaat kuormat, elokuu 2025",
      causeRef: "event:partial-loads@laundry:espoo@2025-08",
      // null ON PURPOSE. The system is allowed to say "we do not know".
      attributedShare: null,
      attributedAmount: unattributed,
      method: "hypothesis",
      evidenceClaimIds: ["clm:water-unattributed"],
    },
    {
      id: "drv:tapiola-loss",
      claimId: "clm:loss-cost-up",
      label: "Tapiolan toimipisteen katoamiset",
      causeRef: "event:loss-spike@site:tapiola",
      attributedShare: lossDelta === 0 ? null : tapiolaLossCostDelta / lossDelta,
      attributedAmount: tapiolaLossCostDelta,
      method: "measured",
      evidenceClaimIds: [],
    },
  ];
}
