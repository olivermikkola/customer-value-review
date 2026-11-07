import { evaluate, variables } from "./expr.ts";
import {
  worstConfidence,
  worstStatus,
  type DataStatus,
  type Confidence,
  type Factor,
  type Measure,
  type Period,
  type Scope,
  type Source,
} from "./model.ts";
import { assert } from "./util.ts";

export interface RefIndex {
  sources: Map<string, Source>;
  measures: Map<string, Measure>;
  factors: Map<string, Factor>;
}

export function factorRef(f: Factor): string {
  return `${f.id}@${f.version}`;
}

export function buildIndex(data: { sources: Source[]; factors: Factor[] }): RefIndex {
  return {
    sources: new Map(data.sources.map((s) => [s.id, s])),
    measures: new Map(),
    factors: new Map(data.factors.map((f) => [factorRef(f), f])),
  };
}

export function resolveRef(
  ref: string,
  idx: RefIndex,
): { value: number; confidence: Confidence; status: DataStatus } {
  if (ref.startsWith("src:")) {
    const s = idx.sources.get(ref);
    assert(s, `unknown source: ${ref}`);
    // A meter reading is measured. A claim about a picked-up weight is measured
    // too — both are point observations, not model output.
    return { value: s.value, confidence: "measured", status: "synthetic" };
  }
  if (ref.startsWith("mea:")) {
    const m = idx.measures.get(ref);
    assert(m, `unknown measure: ${ref} (must be built before it is referenced)`);
    return { value: m.value, confidence: m.confidence, status: m.status ?? "calculated" };
  }
  if (ref.startsWith("fac:")) {
    const f = idx.factors.get(ref);
    assert(f, `unknown factor: ${ref} — factors must be referenced as id@version`);
    return { value: f.value, confidence: f.kind, status: f.status ?? "estimated" };
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
  /** Floor for the measure's status; inputs can only raise it. */
  status?: DataStatus;
}

export function addMeasure(idx: RefIndex, spec: MeasureSpec): Measure {
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
    status: worstStatus(
      spec.status ?? "calculated",
      ...Object.values(spec.bindings).map((r) => resolveRef(r, idx).status),
    ),
  };
  m.value = evaluate(spec.formula, envOf(m, idx));
  idx.measures.set(m.id, m);
  return m;
}
