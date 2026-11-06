import { evaluate, variables } from "./expr.ts";
import {
  worstConfidence,
  type Confidence,
  type Factor,
  type Measure,
  type Period,
  type Scope,
  type Source,
} from "./model.ts";
import { assert } from "./util.ts";
import type { Seed } from "./seed/generate.ts";
import { LAUNDRY_ID, PERIOD_KEYS, SERVICES, SITES, type PeriodKey } from "./seed/plan.ts";

export interface RefIndex {
  sources: Map<string, Source>;
  measures: Map<string, Measure>;
  factors: Map<string, Factor>;
}

export function factorRef(f: Factor): string {
  return `${f.id}@${f.version}`;
}

export function buildIndex(seed: Seed): RefIndex {
  return {
    sources: new Map(seed.sources.map((s) => [s.id, s])),
    measures: new Map(),
    factors: new Map(seed.factors.map((f) => [factorRef(f), f])),
  };
}

function resolveRef(ref: string, idx: RefIndex): { value: number; confidence: Confidence } {
  if (ref.startsWith("src:")) {
    const s = idx.sources.get(ref);
    assert(s, `unknown source: ${ref}`);
    // A meter reading is measured. A claim about a picked-up weight is measured
    // too — both are point observations, not model output.
    return { value: s.value, confidence: "measured" };
  }
  if (ref.startsWith("mea:")) {
    const m = idx.measures.get(ref);
    assert(m, `unknown measure: ${ref} (must be built before it is referenced)`);
    return { value: m.value, confidence: m.confidence };
  }
  if (ref.startsWith("fac:")) {
    const f = idx.factors.get(ref);
    assert(f, `unknown factor: ${ref} — factors must be referenced as id@version`);
    return { value: f.value, confidence: f.kind };
  }
  throw new Error(`unresolvable ref: ${ref}`);
}

function envOf(m: Measure, idx: RefIndex): Record<string, number> {
  const env: Record<string, number> = {};
  for (const [name, ref] of Object.entries(m.bindings)) env[name] = resolveRef(ref, idx).value;
  return env;
}

/** Recompute a measure from its formula and bindings. Never trusts `value`. */
export function recomputeMeasure(m: Measure, idx: RefIndex): number {
  const env = envOf(m, idx);
  for (const v of variables(m.formula)) {
    assert(v in env, `measure ${m.id}: variable "${v}" is used in formula but not bound`);
  }
  return evaluate(m.formula, env);
}

/** A measure's stored value must equal what its formula says, to the last bit. */
export function measureRecomputes(m: Measure, idx: RefIndex, rel = 1e-9): boolean {
  const got = recomputeMeasure(m, idx);
  const scale = Math.max(Math.abs(m.value), Math.abs(got), 1);
  return Math.abs(got - m.value) / scale < rel;
}

interface MeasureSpec {
  id: string;
  metricId: string;
  label: string;
  scope: Scope;
  period: Period;
  unit: string;
  formula: string;
  bindings: Record<string, string>;
  confidence: Confidence;
}

function addMeasure(idx: RefIndex, spec: MeasureSpec): Measure {
  const factors = Object.values(spec.bindings).filter((r) => r.startsWith("fac:"));
  const inputs = Object.values(spec.bindings).filter((r) => !r.startsWith("fac:"));

  const provenanceConfidence = worstConfidence(
    spec.confidence,
    ...inputs.map((r) => resolveRef(r, idx).confidence),
  );

  const m: Measure = {
    id: spec.id,
    metricId: spec.metricId,
    label: spec.label,
    scope: spec.scope,
    period: spec.period,
    value: 0,
    unit: spec.unit,
    formula: spec.formula,
    bindings: spec.bindings,
    inputs,
    factors,
    confidence: provenanceConfidence,
  };
  m.value = evaluate(spec.formula, envOf(m, idx));
  idx.measures.set(m.id, m);
  return m;
}

function sumMeasure(
  idx: RefIndex,
  args: {
    id: string;
    metricId: string;
    label: string;
    scope: Scope;
    period: Period;
    unit: string;
    sources: Source[];
  },
): Measure {
  const bindings: Record<string, string> = {};
  args.sources.forEach((s, i) => (bindings[`v${i + 1}`] = s.id));
  const formula = args.sources.length === 0 ? "0" : Object.keys(bindings).join(" + ");
  return addMeasure(idx, { ...args, formula, bindings, confidence: "measured" });
}

function sourcesIn(seed: Seed, period: PeriodKey, predicate: (s: Source) => boolean): Source[] {
  const q = seed.periods[period];
  return seed.sources.filter(
    (s) => predicate(s) && s.period.from >= q.from && s.period.to <= q.to,
  );
}

export interface BuiltLedger {
  idx: RefIndex;
  measures: Measure[];
}

export function buildMeasures(seed: Seed): BuiltLedger {
  const idx = buildIndex(seed);
  const q = (k: PeriodKey) => seed.periods[k];
  const all = { customerId: seed.customerId };

  for (const period of PERIOD_KEYS) {
    const period_ = q(period);

    // --- material flow, customer level
    sumMeasure(idx, {
      id: `mea:linen_kg:${period}`,
      metricId: "linen_kg",
      label: "Pesty pyykki",
      scope: all,
      period: period_,
      unit: "kg",
      sources: sourcesIn(seed, period, (s) => s.kind === "pickup"),
    });

    sumMeasure(idx, {
      id: `mea:mat_kg:${period}`,
      metricId: "mat_kg",
      label: "Mattopyykki",
      scope: { ...all, serviceId: "svc:mats" },
      period: period_,
      unit: "kg",
      sources: sourcesIn(seed, period, (s) => s.kind === "pickup" && s.serviceId === "svc:mats"),
    });

    // --- sustainability flow
    sumMeasure(idx, {
      id: `mea:water_m3:${period}`,
      metricId: "water_m3",
      label: "Vedenkulutus, pesula",
      scope: all,
      period: period_,
      unit: "m3",
      sources: sourcesIn(seed, period, (s) => s.kind === "meter" && s.id.includes(LAUNDRY_ID)),
    });

    addMeasure(idx, {
      id: `mea:water_intensity:${period}`,
      metricId: "water_intensity",
      label: "Veden ominaiskulutus",
      scope: all,
      period: period_,
      unit: "m3/kg",
      formula: "water_m3 / linen_kg",
      bindings: {
        water_m3: `mea:water_m3:${period}`,
        linen_kg: `mea:linen_kg:${period}`,
      },
      confidence: "measured",
    });

    addMeasure(idx, {
      id: `mea:co2_kg:${period}`,
      metricId: "co2_kg",
      label: "Veden käsittelyn päästöt",
      scope: all,
      period: period_,
      unit: "kgCO2e",
      formula: "water_m3 * co2_per_m3",
      bindings: {
        water_m3: `mea:water_m3:${period}`,
        co2_per_m3: "fac:co2-per-m3-water@v1",
      },
      confidence: "estimated",
    });

    // --- money
    sumMeasure(idx, {
      id: `mea:cost_eur:${period}`,
      metricId: "cost_eur",
      label: "Palvelulaskutus",
      scope: all,
      period: period_,
      unit: "EUR",
      sources: sourcesIn(seed, period, (s) => s.kind === "invoice"),
    });

    // --- circularity
    sumMeasure(idx, {
      id: `mea:loss_items:${period}`,
      metricId: "loss_items",
      label: "Kadonneet vaatteet",
      scope: all,
      period: period_,
      unit: "kpl",
      sources: sourcesIn(seed, period, (s) => s.kind === "loss"),
    });

    addMeasure(idx, {
      id: `mea:loss_cost_eur:${period}`,
      metricId: "loss_cost_eur",
      label: "Katoamisen kustannus",
      scope: all,
      period: period_,
      unit: "EUR",
      formula: "items * replacement_cost",
      bindings: {
        items: `mea:loss_items:${period}`,
        replacement_cost: "fac:garment-replacement-cost@v2",
      },
      confidence: "measured",
    });

    sumMeasure(idx, {
      id: `mea:repairs:${period}`,
      metricId: "repairs",
      label: "Korjatut vaatteet",
      scope: all,
      period: period_,
      unit: "kpl",
      sources: sourcesIn(seed, period, (s) => s.kind === "repair"),
    });

    sumMeasure(idx, {
      id: `mea:issued:${period}`,
      metricId: "issued",
      label: "Kierrossa olevat vaatteet",
      scope: all,
      period: period_,
      unit: "kpl",
      sources: sourcesIn(seed, period, (s) => s.kind === "assignment"),
    });

    addMeasure(idx, {
      id: `mea:repair_rate:${period}`,
      metricId: "repair_rate",
      label: "Korjaussuhde",
      scope: all,
      period: period_,
      unit: "%",
      formula: "repairs / issued * 100",
      bindings: {
        repairs: `mea:repairs:${period}`,
        issued: `mea:issued:${period}`,
      },
      confidence: "measured",
    });

    // --- per-site linen, for the drill-down and for driver attribution
    for (const site of SITES) {
      sumMeasure(idx, {
        id: `mea:linen_kg:${period}:${site.key}`,
        metricId: "linen_kg",
        label: `Pesty pyykki, ${site.name}`,
        scope: { ...all, siteId: site.id },
        period: period_,
        unit: "kg",
        sources: sourcesIn(seed, period, (s) => s.kind === "pickup" && s.siteId === site.id),
      });
      sumMeasure(idx, {
        id: `mea:mat_kg:${period}:${site.key}`,
        metricId: "mat_kg",
        label: `Mattopyykki, ${site.name}`,
        scope: { ...all, siteId: site.id, serviceId: "svc:mats" },
        period: period_,
        unit: "kg",
        sources: sourcesIn(
          seed,
          period,
          (s) => s.kind === "pickup" && s.siteId === site.id && s.serviceId === "svc:mats",
        ),
      });
      sumMeasure(idx, {
        id: `mea:loss_items:${period}:${site.key}`,
        metricId: "loss_items",
        label: `Kadonneet vaatteet, ${site.name}`,
        scope: { ...all, siteId: site.id },
        period: period_,
        unit: "kpl",
        sources: sourcesIn(seed, period, (s) => s.kind === "loss" && s.siteId === site.id),
      });
    }
  }

  // --- counterfactual: water that would have been used with an on-premise laundry
  addMeasure(idx, {
    id: "mea:water_avoided_m3:2025-Q3",
    metricId: "water_avoided_m3",
    label: "Vältetty vesi vs. oma pesula",
    scope: all,
    period: q("2025-Q3"),
    unit: "m3",
    formula: "linen_kg * (counterfactual - actual)",
    bindings: {
      linen_kg: "mea:linen_kg:2025-Q3",
      counterfactual: "fac:counterfactual-laundry-water@v1",
      actual: "mea:water_intensity:2025-Q3",
    },
    confidence: "proxy",
  });

  // --- driver attribution, expressed as measures so it is itself auditable
  addMeasure(idx, {
    id: "mea:water_delta_m3:2024-Q3->2025-Q3",
    metricId: "water_delta_m3",
    label: "Vedenkulutuksen muutos",
    scope: all,
    period: q("2025-Q3"),
    unit: "m3",
    formula: "to - from",
    bindings: { to: "mea:water_m3:2025-Q3", from: "mea:water_m3:2024-Q3" },
    confidence: "measured",
  });

  addMeasure(idx, {
    id: "mea:mat_delta_kg:2024-Q3->2025-Q3",
    metricId: "mat_delta_kg",
    label: "Mattopyykin muutos",
    scope: all,
    period: q("2025-Q3"),
    unit: "kg",
    formula: "to - from",
    bindings: { to: "mea:mat_kg:2025-Q3", from: "mea:mat_kg:2024-Q3" },
    confidence: "measured",
  });

  addMeasure(idx, {
    id: "mea:water_attributable_m3:2025-Q3",
    metricId: "water_attributable_m3",
    label: "Mattotiheyden selittämä vesi",
    scope: all,
    period: q("2025-Q3"),
    unit: "m3",
    formula: "mat_delta * baseline_intensity",
    bindings: {
      mat_delta: "mea:mat_delta_kg:2024-Q3->2025-Q3",
      baseline_intensity: "mea:water_intensity:2024-Q3",
    },
    confidence: "measured",
  });

  addMeasure(idx, {
    id: "mea:water_attribution_share:2025-Q3",
    metricId: "water_attribution_share",
    label: "Selitysosuus",
    scope: all,
    period: q("2025-Q3"),
    unit: "%",
    formula: "attributable / delta * 100",
    bindings: {
      attributable: "mea:water_attributable_m3:2025-Q3",
      delta: "mea:water_delta_m3:2024-Q3->2025-Q3",
    },
    confidence: "measured",
  });

  addMeasure(idx, {
    id: "mea:water_unattributed_m3:2025-Q3",
    metricId: "water_unattributed_m3",
    label: "Selittämätön vesi",
    scope: all,
    period: q("2025-Q3"),
    unit: "m3",
    formula: "delta - attributable",
    bindings: {
      delta: "mea:water_delta_m3:2024-Q3->2025-Q3",
      attributable: "mea:water_attributable_m3:2025-Q3",
    },
    confidence: "measured",
  });

  const measures = [...idx.measures.values()];
  return { idx, measures };
}
