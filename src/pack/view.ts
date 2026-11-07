/**
 * The view model the dashboard renders. Pure function of (ledger, choices).
 *
 * Rule: every number on screen is a `Cell` that points at a ledger measure, so
 * the UI can open its formula and inputs. The only numbers that are not cells
 * are counts of rows the user can see (e.g. "24 sites").
 */
import type { Measure } from "../model.ts";
import { BASELINE_IDS, mid, periodOf, YEAR, type BaselineId, type PackLedger, type Scenario } from "./build.ts";
import type { Pack } from "./read.ts";
import { str } from "./read.ts";

export const PRIORITIES = ["overview", "water", "emissions", "cost", "circularity", "service"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const PRIORITY_INFO: Record<Priority, { label: string; blurb: string }> = {
  overview: { label: "Overall value", blurb: "The balanced annual-review story" },
  water: { label: "Water", blurb: "Fresh water used and saved" },
  emissions: { label: "Emissions", blurb: "Footprint and handprint (CO₂e)" },
  cost: { label: "Cost & allocation", blurb: "Garments in circulation vs. in use" },
  circularity: { label: "Circularity", blurb: "Repair, reuse and waste" },
  service: { label: "Service performance", blurb: "Turnaround, requests, reliability" },
};

export interface Params {
  period: string; // "FY" | "Q1".."Q4"
  baseline: BaselineId;
  scenario: Scenario;
  priority: Priority;
}

export const DEFAULT_PARAMS: Params = { period: "FY", baseline: "B_LOCAL", scenario: "base", priority: "overview" };

export interface Cell {
  id: string;
  value: number;
  display: string;
  unit: string;
  status: string;
  confidence: string;
}

const n = (x: number, d = 0) => x.toLocaleString("en-GB", { minimumFractionDigits: d, maximumFractionDigits: d });

export function fmt(v: number, unit: string): string {
  const a = Math.abs(v);
  switch (unit) {
    case "l":
      return `${n(v / 1000)} m³`;
    case "l/kg":
      return `${n(v, 2)} l/kg`;
    case "kWh":
      return a >= 1e4 ? `${n(v / 1000, 1)} MWh` : `${n(v)} kWh`;
    case "kgCO2e":
      return a >= 1000 ? `${n(v / 1000, 1)} tCO₂e` : `${n(v)} kgCO₂e`;
    case "kg":
      return a >= 1e4 ? `${n(v / 1000, 1)} t` : `${n(v)} kg`;
    case "EUR":
      return a >= 1e6 ? `€${n(v / 1e6, 2)}M` : a >= 1e4 ? `€${n(v / 1000)}k` : `€${n(v)}`;
    case "%":
      return `${n(v, 1)} %`;
    case "hours":
      return `${n(v, 1)} h`;
    case "pieces":
    case "replacements":
      return n(v);
    default:
      return n(v, a < 100 && !Number.isInteger(v) ? 1 : 0);
  }
}

export const UNIT_SUFFIX: Record<string, string> = {
  wearers: "wearers",
  pieces: "garments",
  requests: "requests",
  repairs: "repairs",
  replacements: "replacements",
  cycles: "cycles",
};

function periodKey(p: string): string {
  return p === "FY" ? `${YEAR}-FY` : `${YEAR}-${p}`;
}

export class Reader {
  readonly L: PackLedger;
  constructor(L: PackLedger) {
    this.L = L;
  }
  m(metric: string, key: string, period: string, variant?: string): Measure {
    const x = this.L.idx.measures.get(mid(metric, key, periodKey(period), variant));
    if (!x) throw new Error(`no measure ${mid(metric, key, periodKey(period), variant)}`);
    return x;
  }
  cell(metric: string, key: string, period: string, variant?: string): Cell {
    return cellOf(this.m(metric, key, period, variant));
  }
}

export function cellOf(m: Measure): Cell {
  return { id: m.id, value: m.value, display: fmt(m.value, m.unit), unit: m.unit, status: m.status ?? "calculated", confidence: m.confidence };
}

export interface Kpi {
  id: string;
  label: string;
  cell: Cell;
  sub?: string;
  range?: { low: Cell; high: Cell };
  theme: Priority;
}

export interface Observation {
  id: string;
  theme: Priority;
  tone: "good" | "watch" | "act";
  headline: string;
  detail: string;
  evidence: { label: string; cell: Cell }[];
  discuss: string;
  action: { title: string; effort: "low" | "medium" | "high" };
  caveat: string;
  rank: number;
  source: "rules";
}

/** Industry themes from the pack, mapped to the priorities the user can pick. */
const THEME_TO_PRIORITY: Record<string, Priority> = {
  "Hygiene and compliance": "service",
  "Water efficiency": "water",
  "Service reliability": "service",
  "Cost and allocation efficiency": "cost",
  "Repair and lifetime": "circularity",
  "Safety and availability": "service",
  "Hygiene and traceability": "service",
  "Service continuity": "service",
  "Compliance-ready evidence": "overview",
};

export interface Interpretation {
  text: string;
  priority: Priority;
  baseline?: BaselineId;
  period?: string;
  siteId?: string;
  matched: string[];
}

const RULES: [Priority, RegExp][] = [
  ["water", /\b(water|litre|liter|m3|m³)\w*/i],
  ["emissions", /\b(emission|co2|co₂|carbon|climate|footprint|scope ?3|ghg)\w*/i],
  ["cost", /\b(cost|money|spend|budget|euro|price|alloc|unused|utili[sz]ation|garments per|capital|optimi[sz])\w*/i],
  ["circularity", /\b(circular|repair|reuse|recycl|waste|lifetime|handprint|replacement)\w*/i],
  ["service", /\b(service|deliver|late|on[- ]time|turnaround|reliab|request|hygiene|continuity|traceab)\w*/i],
];

/** Free text → the choices the dashboard understands. Deterministic; a model can phrase this later, not decide it. */
export function interpret(text: string, L: PackLedger): Interpretation {
  const t = text.toLowerCase();
  const matched: string[] = [];
  let priority: Priority = "overview";
  let best = 0;
  for (const [p, re] of RULES) {
    const hits = t.match(new RegExp(re.source, "gi"))?.length ?? 0;
    if (hits > best) {
      best = hits;
      priority = p;
    }
  }
  if (best > 0) matched.push(`priority → ${PRIORITY_INFO[priority].label}`);
  let baseline: BaselineId | undefined;
  if (/\b(home|domestic)\b/.test(t)) baseline = "B_HOME";
  else if (/\b(in[- ]house|own laundry)\b/.test(t)) baseline = "B_INHOUSE";
  else if (/\b(local|outsourced)\b/.test(t)) baseline = "B_LOCAL";
  if (baseline) matched.push(`compare with ${baseline.replace("B_", "").toLowerCase()}`);
  const q = /\bq([1-4])\b/i.exec(t);
  const period = q ? `Q${q[1]}` : undefined;
  if (period) matched.push(`period → ${period}`);
  const site = L.sites.find((s) => t.includes(s.name.toLowerCase()) || t.includes(s.city.toLowerCase()));
  if (site) matched.push(`site → ${site.name}`);
  return { text, priority, baseline, period, siteId: site?.id, matched };
}

export interface CustomerView {
  customer: { id: string; name: string; industry: string; siteCount: number; countries: string[]; laundries: string[] };
  params: Params & { site?: string };
  periodLabel: string;
  baselineLabel: string;
  industry: { emphasis: { rank: number; theme: string; priority: Priority; emphasis: string }[]; defaultPriority: Priority };
  kpis: Kpi[];
  observations: Observation[];
  discussion: string[];
  sites: SiteRow[];
  customerMetrics: Record<string, Cell>;
  comparison: {
    rows: { key: string; label: string; actual: Cell; alternative: Cell; saving: Cell; pct: Cell; low: Cell; high: Cell }[];
    byBaseline: { id: string; label: string; waterPct: Cell; co2Pct: Cell; co2: Cell }[];
  };
  repairs: {
    byType: { label: string; cell: Cell; share: Cell }[];
    byProduct: { label: string; cell: Cell }[];
    handprint: { key: string; label: string; low: Cell; base: Cell; high: Cell }[];
  };
  circularity: { routes: { label: string; cell: Cell }[]; total: Cell; diverted: Cell };
  products: { id: string; name: string; group: string; kg: Cell; alloc: Cell; scan: Cell; rep: Cell }[];
  series: {
    quarterly: { key: string; label: string; points: { period: string; cell: Cell }[] }[];
    monthly: { key: string; label: string; points: { period: string; cell: Cell }[] }[];
  };
  gaps: PackLedger["gaps"];
}

export interface SiteRow {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string;
  laundry: string;
  m: Record<string, Cell>;
}

const SITE_METRICS: [string, string | "BL" | "SC"][] = [
  ["wearers", ""], ["util_pct", ""], ["unused_cost", ""], ["excess_pieces", ""], ["on_time_pct", ""], ["req_per_1k", ""],
  ["avg_cycle_h", ""], ["rep_per_100", ""], ["water_per_kg", ""], ["w_div_pct", ""], ["kg", ""], ["alloc", ""], ["rep", ""],
  ["sav_water_pct", "BL"], ["sav_co2_pct", "BL"], ["sav_water", "BL"], ["sav_co2", "BL"],
];

export function buildView(L: PackLedger, pack: Pack, p: Params, siteId?: string): CustomerView {
  const R = new Reader(L);
  const cid = L.customerId;
  const per = p.period;
  const bl = `${p.baseline}.${p.scenario}`;
  const blv = (s: Scenario) => `${p.baseline}.${s}`;
  const baselineName = str(pack.baselines.find((b) => str(b, "baseline_id") === p.baseline)!, "baseline_name");

  const emphasis = pack.industryPriorities
    .filter((r) => str(r, "industry") === L.industry)
    .sort((a, b) => Number(a.priority_rank) - Number(b.priority_rank))
    .map((r) => ({ rank: Number(r.priority_rank), theme: str(r, "priority_theme"), priority: THEME_TO_PRIORITY[str(r, "priority_theme")] ?? "overview", emphasis: str(r, "dashboard_emphasis") }));

  // ------------------------------------------------------------------ KPIs
  const base = (id: string, label: string, theme: Priority, metric: string, variant?: string, sub?: string): Kpi => ({ id, label, theme, cell: R.cell(metric, cid, per, variant), sub });
  const ranged = (k: Kpi, metric: string, variantOf: (s: Scenario) => string): Kpi => ({ ...k, range: { low: R.cell(metric, cid, per, variantOf("low")), high: R.cell(metric, cid, per, variantOf("high")) } });
  const catalog: Record<string, Kpi> = {
    wearers: base("wearers", "Active wearers", "service", "wearers", undefined, "monthly average"),
    alloc: base("alloc", "Garments in circulation", "cost", "alloc", undefined, "monthly average"),
    kg: base("kg", "Textiles washed", "overview", "kg"),
    util: base("util", "Garments in active use", "cost", "util_pct", undefined, "scanned ÷ allocated"),
    unused: base("unused", "Capital in unused garments", "cost", "unused_cost", undefined, "estimated, synthetic prices"),
    excess: base("excess", "Garments above average need", "cost", "excess_pieces", undefined, "vs. customer-average utilisation"),
    perWearer: base("perWearer", "Garments per wearer", "cost", "pcs_per_wearer"),
    ontime: base("ontime", "Cycles delivered on time", "service", "on_time_pct"),
    cycle: base("cycle", "Average cycle time", "service", "avg_cycle_h", undefined, "pickup → delivery"),
    req: base("req", "Service requests", "service", "req_per_1k", undefined, "per 1 000 wearers"),
    rep: base("rep", "Repairs completed", "circularity", "rep"),
    repPer: base("repPer", "Repairs per 100 wearers", "circularity", "rep_per_100"),
    post: ranged(base("post", "Replacements postponed", "circularity", "rep_postponed", p.scenario, "estimate · 1 repair ≈ 1 replacement"), "rep_postponed", (s) => s),
    postCo2: ranged(base("postCo2", "Avoided product emissions", "circularity", "rep_avoided_co2", p.scenario, "estimate from repairs"), "rep_avoided_co2", (s) => s),
    postEur: ranged(base("postEur", "Avoided purchase cost", "circularity", "rep_avoided_eur", p.scenario, "estimate, synthetic prices"), "rep_avoided_eur", (s) => s),
    div: base("div", "Waste kept out of incineration", "circularity", "w_div_pct", undefined, "allocated estimate"),
    waste: base("waste", "Textile waste attributed", "circularity", "w_total", undefined, "allocated estimate"),
    waterS: ranged(base("waterS", "Water saved vs. alternative", "water", "sav_water", bl, `vs. ${baselineName.toLowerCase()}`), "sav_water", blv),
    waterP: base("waterP", "Water saving", "water", "sav_water_pct", bl, `vs. ${baselineName.toLowerCase()}`),
    waterA: base("waterA", "Fresh water used", "water", "a_water", undefined, "allocated from laundry"),
    waterKg: base("waterKg", "Water per washed kg", "water", "water_per_kg", undefined, "allocated"),
    energyS: ranged(base("energyS", "Energy saved vs. alternative", "emissions", "sav_energy", bl, `vs. ${baselineName.toLowerCase()}`), "sav_energy", blv),
    co2S: ranged(base("co2S", "Emissions saved vs. alternative", "emissions", "sav_co2", bl, `vs. ${baselineName.toLowerCase()}`), "sav_co2", blv),
    co2P: base("co2P", "Emission saving", "emissions", "sav_co2_pct", bl, `vs. ${baselineName.toLowerCase()}`),
    co2A: base("co2A", "Emissions attributed", "emissions", "a_co2", undefined, "process + delivery, allocated"),
  };
  const ORDER: Record<Priority, string[]> = {
    overview: ["wearers", "alloc", "kg", "ontime", "rep", "waterS", "co2S", "unused"],
    water: ["waterS", "waterP", "waterA", "waterKg", "kg", "energyS", "co2S", "ontime"],
    emissions: ["co2S", "co2P", "co2A", "postCo2", "energyS", "waterS", "kg", "rep"],
    cost: ["unused", "excess", "util", "alloc", "perWearer", "wearers", "postEur", "kg"],
    circularity: ["rep", "post", "postCo2", "postEur", "div", "waste", "repPer", "kg"],
    service: ["ontime", "cycle", "req", "wearers", "util", "kg", "rep", "alloc"],
  };
  const kpis = ORDER[p.priority].map((k) => catalog[k]!);

  // ----------------------------------------------------------------- sites
  const sites: SiteRow[] = L.sites.map((s) => {
    const m: Record<string, Cell> = {};
    for (const [metric, kind] of SITE_METRICS) m[metric] = R.cell(metric, s.id, per, kind === "BL" ? bl : undefined);
    return { id: s.id, name: s.name, city: s.city, country: s.country, type: s.type, laundry: L.laundries.find((l) => l.id === s.laundryId)?.name ?? s.laundryId, m };
  });

  const customerMetrics: Record<string, Cell> = {};
  for (const [metric, kind] of SITE_METRICS) customerMetrics[metric] = R.cell(metric, cid, per, kind === "BL" ? bl : undefined);

  // ------------------------------------------------------------ comparison
  const cmpRows = [
    { key: "water", label: "Fresh water", actual: "a_water", alt: "cmp_water", sav: "sav_water", pct: "sav_water_pct" },
    { key: "energy", label: "Process energy", actual: "a_energy", alt: "cmp_energy", sav: "sav_energy", pct: "sav_energy_pct" },
    { key: "co2", label: "Emissions (process + delivery)", actual: "a_co2", alt: "cmp_co2", sav: "sav_co2", pct: "sav_co2_pct" },
  ].map((r) => ({
    key: r.key,
    label: r.label,
    actual: R.cell(r.actual, cid, per),
    alternative: R.cell(r.alt, cid, per, bl),
    saving: R.cell(r.sav, cid, per, bl),
    pct: R.cell(r.pct, cid, per, bl),
    low: R.cell(r.sav, cid, per, blv("low")),
    high: R.cell(r.sav, cid, per, blv("high")),
  }));
  const byBaseline = BASELINE_IDS.map((b) => ({
    id: b,
    label: str(pack.baselines.find((x) => str(x, "baseline_id") === b)!, "baseline_name"),
    waterPct: R.cell("sav_water_pct", cid, per, `${b}.${p.scenario}`),
    co2Pct: R.cell("sav_co2_pct", cid, per, `${b}.${p.scenario}`),
    co2: R.cell("sav_co2", cid, per, `${b}.${p.scenario}`),
  }));

  // --------------------------------------------------------------- repairs
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const repairs = {
    byType: L.repairTypes
      .map((t) => ({ label: t.toLowerCase().replace(/^./, (c) => c.toUpperCase()), cell: R.cell("rep_t", `${cid}.${slug(t)}`, per), share: R.cell("rep_t_share", `${cid}.${slug(t)}`, per) }))
      .sort((a, b) => b.cell.value - a.cell.value),
    byProduct: L.products.map((pr) => ({ label: pr.name, cell: R.cell("rep_p", `${cid}.${pr.id}`, per) })).sort((a, b) => b.cell.value - a.cell.value),
    handprint: [
      ["rep_postponed", "Replacements postponed"],
      ["rep_avoided_co2", "Avoided product emissions"],
      ["rep_avoided_eur", "Avoided purchase cost"],
    ].map(([metric, label]) => ({ key: metric!, label: label!, low: R.cell(metric!, cid, per, "low"), base: R.cell(metric!, cid, per, "base"), high: R.cell(metric!, cid, per, "high") })),
  };
  const circularity = {
    routes: [["w_rec", "Recycled"], ["w_reuse", "Reused"], ["w_erec", "Energy recovery"], ["w_inc", "Incinerated"]].map(([m, label]) => ({ label: label!, cell: R.cell(m!, cid, per) })),
    total: R.cell("w_total", cid, per),
    diverted: R.cell("w_div_pct", cid, per),
  };
  const products = L.products.map((pr) => ({
    id: pr.id, name: pr.name, group: pr.group,
    kg: R.cell("kg_p", `${cid}.${pr.id}`, per), alloc: R.cell("alloc_p", `${cid}.${pr.id}`, per),
    scan: R.cell("scan_p", `${cid}.${pr.id}`, per), rep: R.cell("rep_p", `${cid}.${pr.id}`, per),
  }));

  // ---------------------------------------------------------------- series
  const Q = ["Q1", "Q2", "Q3", "Q4"];
  const quarterly = [
    ["util_pct", "Garments in active use", undefined],
    ["on_time_pct", "Cycles on time", undefined],
    ["req_per_1k", "Service requests per 1 000 wearers", undefined],
    ["sav_water_pct", "Water saving vs. alternative", bl],
    ["sav_co2_pct", "Emission saving vs. alternative", bl],
  ].map(([metric, label, variant]) => ({ key: metric!, label: label!, points: Q.map((q) => ({ period: q, cell: R.cell(metric!, cid, q, variant)})) }));
  const monthly = [["kg", "Textiles washed"], ["req", "Service requests"], ["rep", "Repairs completed"], ["wearers", "Active wearers"]].map(([metric, label]) => ({
    key: metric!, label: label!,
    points: Array.from({ length: 12 }, (_, i) => {
      const mo = `${YEAR}-${String(i + 1).padStart(2, "0")}`;
      return { period: mo, cell: cellOf(L.idx.measures.get(mid(metric!, cid, mo))!) };
    }),
  }));

  const view: CustomerView = {
    customer: { id: cid, name: L.customerName, industry: L.industry, siteCount: L.sites.length, countries: [...new Set(L.sites.map((s) => s.country))], laundries: L.laundries.map((l) => l.name) },
    params: { ...p, site: siteId },
    periodLabel: per === "FY" ? `Full year ${YEAR}` : `${per} ${YEAR}`,
    baselineLabel: baselineName,
    industry: { emphasis, defaultPriority: emphasis[0]?.priority ?? "overview" },
    kpis,
    observations: [],
    discussion: [],
    sites,
    customerMetrics,
    comparison: { rows: cmpRows, byBaseline },
    repairs,
    circularity,
    products,
    series: { quarterly, monthly },
    gaps: L.gaps,
  };
  view.observations = observe(view, R, L, p);
  view.discussion = view.observations.slice(0, 5).map((o) => o.discuss);
  return view;
}

// ------------------------------------------------------------------ observations

const ev = (label: string, cell: Cell) => ({ label, cell });
const pct = (x: number, d = 0) => `${n(x, d)} %`;

/**
 * Rule-generated observations. Each one names the numbers it stands on (as cells), says what to
 * discuss, proposes an action with an effort level, and carries its own caveat.
 * Ranked by how much the chosen priority and the customer's industry care about the theme.
 */
function observe(v: CustomerView, R: Reader, L: PackLedger, p: Params): Observation[] {
  const out: Omit<Observation, "rank" | "source">[] = [];
  const per = p.period;
  const cid = L.customerId;
  const bl = `${p.baseline}.${p.scenario}`;
  const lo = `${p.baseline}.low`;
  const hi = `${p.baseline}.high`;
  const sites = v.sites;
  const avg = (metric: string) => R.cell(metric, cid, per);
  const alt = v.baselineLabel.toLowerCase();
  const short = (name: string) => name.replace(new RegExp(`^${L.customerName.split(" ")[0]} `), "");

  // 1 · allocation outliers
  {
    const ranked = [...sites].sort((a, b) => b.m.excess_pieces!.value - a.m.excess_pieces!.value);
    const top = ranked.slice(0, Math.min(3, ranked.length));
    const totalExcess = avg("excess_pieces");
    const topSum = top.reduce((a, s) => a + s.m.excess_pieces!.value, 0);
    if (totalExcess.value > 0) {
      out.push({
        id: "obs:allocation",
        theme: "cost",
        tone: "act",
        headline: `${top.map((s) => short(s.name)).join(", ")} hold ${pct((topSum / totalExcess.value) * 100)} of the surplus garments`,
        detail: `Customer-wide, ${avg("util_pct").display} of allocated garments are scanned in use. Against that average, about ${totalExcess.display} garments are allocated above need, concentrated at ${top.length} sites.`,
        evidence: [ev("Customer utilisation", avg("util_pct")), ev("Surplus garments, customer", totalExcess), ...top.map((s) => ev(`Surplus at ${s.name}`, s.m.excess_pieces!))],
        discuss: `Which of the ${top.length} sites with the most surplus garments can reduce their allocation without hurting availability?`,
        action: { title: "Review allocation at the top surplus sites and agree a target level", effort: "low" },
        caveat: "Utilisation is scanned ÷ allocated from synthetic scan counts; seasonal peaks and safety stock are not modelled.",
      });
    }
  }

  // 2 · service reliability
  {
    const ot = avg("on_time_pct");
    const worst = [...sites].filter((s) => s.m.on_time_pct!.value < ot.value).sort((a, b) => a.m.on_time_pct!.value - b.m.on_time_pct!.value).slice(0, 3);
    const reqs = [...sites].sort((a, b) => b.m.req_per_1k!.value - a.m.req_per_1k!.value)[0]!;
    out.push({
      id: "obs:service",
      theme: "service",
      tone: ot.value >= 98 ? "good" : "watch",
      headline: `${ot.display} of cycles were delivered on time${worst[0] ? `; ${short(worst[0].name)} is lowest at ${worst[0].m.on_time_pct!.display}` : ""}`,
      detail: `Average cycle time is ${avg("avg_cycle_h").display} from pickup to delivery. Requests run at ${avg("req_per_1k").display.replace(" ", "")} per 1 000 wearers; the highest site is ${short(reqs.name)} (${reqs.m.req_per_1k!.display}).`,
      evidence: [ev("On-time cycles", ot), ev("Average cycle time", avg("avg_cycle_h")), ev("Requests per 1 000 wearers", avg("req_per_1k")), ...worst.map((s) => ev(`On-time at ${s.name}`, s.m.on_time_pct!))],
      discuss: worst[0] ? `What is behind the late cycles at ${worst[0].name}, and is the pickup schedule right for that site?` : "Is the current delivery schedule meeting each site's needs?",
      action: { title: "Walk through late cycles per site with the laundry and fix the root cause", effort: "medium" },
      caveat: "A cycle is late when flagged LATE in the synthetic service-cycle data; the pack carries no reason codes.",
    });
  }

  // 3 · water
  {
    const s = R.cell("sav_water", cid, per, bl);
    const sp = R.cell("sav_water_pct", cid, per, bl);
    const bySite = [...sites].sort((a, b) => b.m.water_per_kg!.value - a.m.water_per_kg!.value);
    const hiW = bySite[0]!;
    const loW = bySite[bySite.length - 1]!;
    out.push({
      id: "obs:water",
      theme: "water",
      tone: "good",
      headline: `Estimated ${s.display} less fresh water than ${alt} (${sp.display})`,
      detail: `Range across assumptions: ${R.cell("sav_water", cid, per, lo).display} to ${R.cell("sav_water", cid, per, hi).display}. Water use per washed kg differs by laundry: ${loW.m.water_per_kg!.display} at ${loW.name} against ${hiW.m.water_per_kg!.display} at ${hiW.name}.`,
      evidence: [ev("Water saved (selected case)", s), ev("Low case", R.cell("sav_water", cid, per, lo)), ev("High case", R.cell("sav_water", cid, per, hi)), ev(`Water per kg, ${hiW.name}`, hiW.m.water_per_kg!), ev(`Water per kg, ${loW.name}`, loW.m.water_per_kg!)],
      discuss: "Is this the right comparison for your own laundry situation, and which baseline would you trust in an internal report?",
      action: { title: "Agree the comparison baseline and ask the laundries serving the highest-use sites for a water-efficiency plan", effort: "medium" },
      caveat: "Water is laundry-level and allocated by washed-kg share; the alternative is an illustrative per-kg value with a prototype ±20 % band.",
    });
  }

  // 4 · emissions
  {
    const s = R.cell("sav_co2", cid, per, bl);
    const sp = R.cell("sav_co2_pct", cid, per, bl);
    out.push({
      id: "obs:emissions",
      theme: "emissions",
      tone: "good",
      headline: `Estimated ${s.display} lower emissions than ${alt}`,
      detail: `That is ${sp.display} below the alternative; assumptions give ${R.cell("sav_co2", cid, per, lo).display} to ${R.cell("sav_co2", cid, per, hi).display}. Emissions attributed to this customer: ${avg("a_co2").display}. This comes from illustrative factors and should be read as a direction, not a reportable figure.`,
      evidence: [ev("Emissions saved (selected case)", s), ev("Low case", R.cell("sav_co2", cid, per, lo)), ev("High case", R.cell("sav_co2", cid, per, hi)), ev("Emissions attributed", avg("a_co2"))],
      discuss: "Which scope-3 questions do you need evidence for, and what data would make this figure reportable?",
      action: { title: "Replace illustrative baseline factors with approved ones before using the figure externally", effort: "high" },
      caveat: "Baseline factors are illustrative, allocation is by washed-kg share, and nothing here is audited. Do not quote as a verified saving.",
    });
  }

  // 5 · circularity / repair
  {
    const post = R.cell("rep_postponed", cid, per, p.scenario);
    const top = v.repairs.byType[0]!;
    out.push({
      id: "obs:repair",
      theme: "circularity",
      tone: "good",
      headline: `${avg("rep").display} repairs kept garments in service, postponing an estimated ${post.display} replacements`,
      detail: `Between ${R.cell("rep_postponed", cid, per, "low").display} and ${R.cell("rep_postponed", cid, per, "high").display} depending on how many repairs really avoid a replacement. ${top.label} is the most common repair (${top.share.display}). ${v.circularity.diverted.display} of attributed textile waste stays out of incineration.`,
      evidence: [ev("Repairs completed", avg("rep")), ev("Replacements postponed (est.)", post), ev("Most common repair share", top.share), ev("Waste kept out of incineration", v.circularity.diverted)],
      discuss: `Is the high share of ${top.label.toLowerCase()} repairs a sign of a product or handling issue worth fixing at the source?`,
      action: { title: "Review the top repair types with product and site teams to cut avoidable damage", effort: "medium" },
      caveat: "Assumes one completed repair postpones one replacement (A002); the low case halves it. Not an audited avoided-purchase claim.",
    });
  }

  // 6 · usage vs allocation per wearer
  {
    const ppw = avg("pcs_per_wearer");
    const top = [...sites].sort((a, b) => b.m.unused_cost!.value - a.m.unused_cost!.value)[0]!;
    out.push({
      id: "obs:capital",
      theme: "cost",
      tone: "watch",
      headline: `About ${avg("unused_cost").display} of garment value sits in stock that is allocated but not scanned`,
      detail: `${ppw.display} garments are allocated per wearer on average. The largest share is at ${top.name} (${top.m.unused_cost!.display}). Priced at synthetic purchase cost, so read it as order of magnitude.`,
      evidence: [ev("Capital in unscanned garments", avg("unused_cost")), ev("Garments per wearer", ppw), ev(`Unscanned value at ${top.name}`, top.m.unused_cost!)],
      discuss: "Is the extra stock deliberate (buffer for peaks) or has it accumulated?",
      action: { title: "Agree a target garments-per-wearer level by site type", effort: "low" },
      caveat: "No contract prices are in the pack. Synthetic purchase cost is a stand-in; this is not a rental saving.",
    });
  }

  // rank by priority + industry emphasis
  const industryRank = new Map(v.industry.emphasis.map((e) => [e.priority, e.rank]));
  const SEV = { act: 1.0, watch: 0.8, good: 0.7 };
  return out
    .map((o) => {
      const themeW = (o.theme === p.priority ? 3 : 1) * (industryRank.has(o.theme) ? 1.6 - 0.2 * (industryRank.get(o.theme)! - 1) : 1);
      return { ...o, source: "rules" as const, rank: Math.round(themeW * SEV[o.tone] * 100) / 100 };
    })
    .sort((a, b) => b.rank - a.rank || a.id.localeCompare(b.id));
}

export function periodRange(period: string) {
  return periodOf(periodKey(period));
}
