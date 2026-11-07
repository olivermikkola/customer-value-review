/**
 * HTTP-facing layer for the dashboard: loads the pack once, answers view and trace requests.
 */
import { measureRecomputes } from "../ledger.ts";
import type { Measure } from "../model.ts";
import { BASELINE_IDS, buildPackLedger, SCENARIOS, YEAR, type BaselineId, type PackLedger, type Scenario } from "./build.ts";
import { PACK_FILE } from "./file.ts";
import { gateText, routeQuestion, tasksFor, toPublic, summaryTask, observationTask, type Task } from "./narrate.ts";
import { answerQuestion, intentTexts, THRESHOLDS } from "./answer.ts";
import { buildDeck } from "./deck.ts";
import { readPack, str, type Pack } from "./read.ts";
import { buildView, DEFAULT_PARAMS, fmt, interpret, PRIORITIES, PRIORITY_INFO, type Params, type Priority } from "./view.ts";

export interface Loaded {
  pack: Pack;
  ledgers: Map<string, PackLedger>;
}

export async function loadAll(file = PACK_FILE): Promise<Loaded> {
  const pack = await readPack(file);
  const ledgers = new Map<string, PackLedger>();
  for (const c of pack.customers) {
    const L = buildPackLedger(pack, str(c, "customer_id"));
    // Same rule as the rest of LANKA: if a number does not recompute, the server does not start.
    const bad = L.measures.find((m) => !measureRecomputes(m, L.idx));
    if (bad) throw new Error(`measure ${bad.id} does not recompute from its inputs`);
    ledgers.set(L.customerId, L);
  }
  return { pack, ledgers };
}

export function meta(d: Loaded) {
  const { pack } = d;
  return {
    year: YEAR,
    synthetic: true,
    customers: [...d.ledgers.values()].map((L) => ({ id: L.customerId, name: L.customerName, industry: L.industry, sites: L.sites.length, countries: [...new Set(L.sites.map((s) => s.country))] })),
    periods: [{ id: "FY", label: `Full year ${YEAR}` }, ...["Q1", "Q2", "Q3", "Q4"].map((q) => ({ id: q, label: `${q} ${YEAR}` }))],
    baselines: pack.baselines.map((b) => ({ id: str(b, "baseline_id"), name: str(b, "baseline_name"), note: str(b, "assumption_note"), isDefault: str(b, "selection_status") === "DEFAULT" })),
    scenarios: SCENARIOS,
    priorities: PRIORITIES.map((id) => ({ id, ...PRIORITY_INFO[id] })),
    prompts: pack.suggestedPrompts.map((r) => ({ who: str(r, "user_type"), prompt: str(r, "prompt") })),
    assumptions: pack.assumptions.map((r) => ({ id: str(r, "assumption_id"), name: str(r, "assumption"), rule: str(r, "value_or_rule"), why: str(r, "rationale"), confidence: str(r, "confidence"), treatment: str(r, "treatment") })),
    dataQuality: pack.dataQuality.map((r) => ({ dataset: str(r, "dataset"), status: str(r, "status"), confidence: str(r, "confidence"), note: str(r, "note") })),
  };
}

function pick<T extends string>(v: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(v as T) ? (v as T) : fallback;
}

export function paramsFrom(q: URLSearchParams, L: PackLedger): { params: Params; siteId?: string } {
  const industryDefault = DEFAULT_PARAMS.priority;
  const site = q.get("site");
  return {
    params: {
      period: pick(q.get("period"), ["FY", "Q1", "Q2", "Q3", "Q4"] as const, DEFAULT_PARAMS.period as "FY"),
      baseline: pick(q.get("baseline"), BASELINE_IDS, DEFAULT_PARAMS.baseline) as BaselineId,
      scenario: pick(q.get("scenario"), SCENARIOS, DEFAULT_PARAMS.scenario) as Scenario,
      priority: pick(q.get("priority"), PRIORITIES, industryDefault) as Priority,
    },
    siteId: site && L.sites.some((s) => s.id === site) ? site : undefined,
  };
}

export function view(d: Loaded, customer: string, q: URLSearchParams) {
  const L = d.ledgers.get(customer);
  if (!L) return null;
  const { params, siteId } = paramsFrom(q, L);
  return buildView(L, d.pack, params, siteId);
}

export function ask(d: Loaded, customer: string, text: string) {
  const L = d.ledgers.get(customer);
  return L ? interpret(text, L) : null;
}

/** One step of a measure's evidence chain: its formula and what each input is. */
export function trace(d: Loaded, customer: string, id: string) {
  const L = d.ledgers.get(customer);
  const m = L?.idx.measures.get(id);
  if (!L || !m) return null;
  const inputs = Object.entries(m.bindings).map(([name, ref]) => describe(L, name, ref));
  const MAX = 40;
  return {
    id: m.id,
    label: m.label,
    unit: m.unit,
    display: fmt(m.value, m.unit),
    value: m.value,
    status: m.status ?? "calculated",
    confidence: m.confidence,
    period: m.period,
    scope: m.scope,
    formula: m.formula.length > 160 ? `${m.formula.slice(0, 157)}…` : m.formula,
    inputCount: inputs.length,
    inputs: inputs.slice(0, MAX),
    truncated: inputs.length > MAX,
    recomputes: measureRecomputes(m, L.idx),
  };
}

function describe(L: PackLedger, name: string, ref: string) {
  if (ref.startsWith("mea:")) {
    const x = L.idx.measures.get(ref) as Measure;
    return { name, ref, kind: "measure" as const, label: x.label, display: fmt(x.value, x.unit), value: x.value, unit: x.unit, status: x.status ?? "calculated", scope: x.scope.siteId ?? x.scope.laundryId ?? x.scope.customerId, period: x.period };
  }
  if (ref.startsWith("src:")) {
    const s = L.idx.sources.get(ref)!;
    return { name, ref, kind: "source" as const, label: `${s.kind.replace(/_/g, " ")} · ${s.siteId ?? ""} ${s.period.from.slice(0, 7)}`.trim(), display: fmt(s.value, s.unit), value: s.value, unit: s.unit, status: "synthetic", source: s.ref, dataStatus: s.dataStatus, checksum: s.checksum };
  }
  const f = L.idx.factors.get(ref)!;
  return { name, ref, kind: "factor" as const, label: f.name, display: `${f.value} ${f.unit}`, value: f.value, unit: f.unit, status: f.status ?? "estimated", source: f.sourceRef };
}

export async function deck(d: Loaded, customer: string, q: URLSearchParams) {
  const v = view(d, customer, q);
  if (!v) return null;
  const name = `${v.customer.name.replace(/[^A-Za-z0-9]+/g, "_")}_review_${v.params.period === "FY" ? "2025" : v.params.period}_${v.params.priority}.pptx`;
  return { name, body: await buildDeck(v) };
}

// ------------------------------------------------------------------ language-model layer

function viewParams(d: Loaded, customer: string, q: URLSearchParams) {
  const L = d.ledgers.get(customer);
  if (!L) return null;
  return paramsFrom(q, L);
}

/** The tasks the browser model works through for this exact view. */
export function narrate(d: Loaded, customer: string, q: URLSearchParams) {
  const v = view(d, customer, q);
  return v ? { view: { periodLabel: v.periodLabel, baseline: v.baselineLabel }, tasks: tasksFor(v).map(toPublic) } : null;
}

/** A free-text question: either an honest "no data" (with the module that would answer it) or a task for the model. */
export function answer(d: Loaded, customer: string, text: string, q: URLSearchParams) {
  const L = d.ledgers.get(customer);
  if (!L) return null;
  const interp = interpret(text, L);
  const params = new URLSearchParams(q);
  params.set("priority", interp.priority);
  if (interp.baseline) params.set("baseline", interp.baseline);
  if (interp.period) params.set("period", interp.period);
  const v = view(d, customer, params)!;
  const routed = routeQuestion(v, text, interp);
  return "noData" in routed ? { interpretation: interp, ...routed } : { interpretation: interp, task: toPublic(routed.task), params: Object.fromEntries(params) };
}

function rebuild(d: Loaded, customer: string, q: URLSearchParams, taskId: string, question?: string): { task: Task; view: ReturnType<typeof buildView> } | null {
  const L = d.ledgers.get(customer);
  if (!L) return null;
  if (taskId === "answer") {
    const interp = interpret(question ?? "", L);
    const v = view(d, customer, q)!;
    const routed = routeQuestion(v, question ?? "", interp);
    return "task" in routed ? { task: routed.task, view: v } : null;
  }
  const v = view(d, customer, q)!;
  if (taskId === "summary") return { task: summaryTask(v), view: v };
  const o = v.observations.find((x) => x.id === taskId);
  return o ? { task: observationTask(v, o), view: v } : null;
}

/** The gate. The task is rebuilt here from the view, so the browser cannot widen what the model may say. */
export function gate(d: Loaded, body: { customer?: string; params?: Record<string, string>; task?: string; question?: string; raw?: string; keep?: string[] }) {
  const r = rebuild(d, body.customer ?? "CUST001", new URLSearchParams(body.params ?? {}), String(body.task ?? ""), body.question);
  if (!r) return null;
  const keep = Array.isArray(body.keep) ? body.keep.map(String) : [];
  return gateText(r.task, r.view, String(body.raw ?? ""), keep);
}

// ------------------------------------------------------------------ answers without a model

/** What the browser's embedding model compares questions against. */
export function intents() {
  return { intents: intentTexts(), thresholds: THRESHOLDS };
}

/** A free-text question, answered from the figures by rules. `sims` is the embedding model's best similarity per intent (optional). */
export function reply(d: Loaded, customer: string, text: string, q: URLSearchParams, sims?: Record<string, number>, force?: string) {
  const L = d.ledgers.get(customer);
  if (!L) return null;
  const interp = interpret(text, L);
  const params = new URLSearchParams(q);
  if (interp.priority !== "overview") params.set("priority", interp.priority);
  if (interp.baseline) params.set("baseline", interp.baseline);
  if (interp.period) params.set("period", interp.period);
  const v = view(d, customer, params)!;
  return { interpretation: interp, params: Object.fromEntries(params), answer: answerQuestion(v, text, interp, sims, force) };
}
