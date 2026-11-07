/**
 * Turns the data pack into a verifiable ledger for one customer.
 *
 * Shape of the chain (every arrow is a formula that can be recomputed):
 *
 *   Excel cell ─► Source ─► site-month ─► site-quarter ─► site-year
 *                                              └────────► customer-quarter ─► customer-year
 *   laundry-month totals ─► per-kg intensity ─┘ (allocation by washed-kg share)
 *   baseline factor × washed kg ─► "what the alternative would have used" ─► saving
 *
 * Nothing here trusts a precomputed column in the pack. `Customer_Impacts` is
 * only used afterwards, as an independent check on our own recomputation.
 */
import { addMeasure, buildIndex, type RefIndex } from "../ledger.ts";
import type { Factor, Measure, Scope, Source, SourceKind } from "../model.ts";
import { assert, checksum, round } from "../util.ts";
import { num, str, type Pack, type Row } from "./read.ts";

export const YEAR = "2025";
export const SCENARIOS = ["low", "base", "high"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export const BASELINE_IDS = ["B_LOCAL", "B_HOME", "B_INHOUSE"] as const;
export type BaselineId = (typeof BASELINE_IDS)[number];

/**
 * Prototype sensitivity band on the baseline's per-kg values. The pack gives a
 * single value per baseline; low/base/high is OUR assumption, labelled as such.
 * "low" is the conservative case: the alternative is assumed to use less.
 */
export const BASELINE_BAND: Record<Scenario, number> = { low: 0.8, base: 1, high: 1.2 };

/**
 * Share of completed repairs that really postpone a replacement. The pack's
 * working assumption (A002) is 1.0; low tests the claim at half strength.
 * There is no evidence for a value above 1, so high stays at 1.
 */
export const REPAIR_RATIO: Record<Scenario, number> = { low: 0.5, base: 1, high: 1 };

export const MONTHS = Array.from({ length: 12 }, (_, i) => `${YEAR}-${String(i + 1).padStart(2, "0")}`);
export const PERIOD_KEYS = [`${YEAR}-Q1`, `${YEAR}-Q2`, `${YEAR}-Q3`, `${YEAR}-Q4`, `${YEAR}-FY`] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];
const QUARTER_MONTHS: Record<string, string[]> = {
  [`${YEAR}-Q1`]: MONTHS.slice(0, 3),
  [`${YEAR}-Q2`]: MONTHS.slice(3, 6),
  [`${YEAR}-Q3`]: MONTHS.slice(6, 9),
  [`${YEAR}-Q4`]: MONTHS.slice(9, 12),
};
const QUARTERS = Object.keys(QUARTER_MONTHS);
export const QUARTER_KEYS = QUARTERS;

function monthPeriod(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}
export function periodOf(key: string) {
  if (key.endsWith("-FY")) return { from: `${YEAR}-01-01`, to: `${YEAR}-12-31` };
  const ms = QUARTER_MONTHS[key];
  if (ms) return { from: monthPeriod(ms[0]!).from, to: monthPeriod(ms[2]!).to };
  return monthPeriod(key);
}

export interface SiteInfo {
  id: string;
  name: string;
  city: string;
  country: string;
  type: string;
  laundryId: string;
  productIds: string[];
}

export interface Reconciliation {
  check: string;
  ours: number;
  pack: number;
  relDiff: number;
}

export interface DataGap {
  id: string;
  severity: "info" | "limit" | "gap";
  text: string;
}

export interface PackLedger {
  customerId: string;
  customerName: string;
  industry: string;
  sites: SiteInfo[];
  products: { id: string; name: string; group: string; footprint: number; cost: number }[];
  laundries: { id: string; name: string; country: string }[];
  sources: Source[];
  factors: Factor[];
  measures: Measure[];
  idx: RefIndex;
  repairTypes: string[];
  reconciliation: Reconciliation[];
  gaps: DataGap[];
}

const INGESTED_AT = "2026-11-02T00:00:00Z";

export function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** Measure id helper. `scopeKey` is a customer id, site id, `site.product`, ... */
export function mid(metric: string, scopeKey: string, period: string, variant?: string): string {
  return `mea:${metric}:${scopeKey}:${period}${variant ? `:${variant}` : ""}`;
}

export function buildPackLedger(pack: Pack, customerId: string): PackLedger {
  const customer = pack.customers.find((c) => str(c, "customer_id") === customerId);
  assert(customer, `unknown customer ${customerId}`);

  const siteRows = pack.sites.filter((s) => str(s, "customer_id") === customerId);
  const siteIds = new Set(siteRows.map((s) => str(s, "site_id")));
  const sa = pack.serviceActivity.filter((r) => str(r, "customer_id") === customerId);
  const rp = pack.repairs.filter((r) => str(r, "customer_id") === customerId);
  const productInfo = new Map(pack.products.map((p) => [str(p, "product_id"), p]));
  const laundryIds = [...new Set(siteRows.map((s) => str(s, "primary_laundry_id")))].sort();

  const sources: Source[] = [];
  const srcById = new Map<string, Source>();
  const addSource = (
    id: string,
    kind: SourceKind,
    siteId: string | undefined,
    month: string,
    value: number,
    unit: string,
    ref: string,
    granularity: Source["granularity"],
    dataStatus: string,
    content?: unknown,
  ) => {
    assert(!srcById.has(id), `duplicate source id ${id} (${ref})`);
    const s: Source = {
      id,
      kind,
      siteId,
      period: monthPeriod(month),
      value,
      unit,
      granularity,
      ref,
      ingestedAt: INGESTED_AT,
      checksum: checksum({ id, value, ref, content }),
      dataStatus,
    };
    sources.push(s);
    srcById.set(id, s);
    return s.id;
  };

  // ------------------------------------------------------------------ sources
  const SA_COLS: [string, string, string, string][] = [
    ["wearers", "active_wearers", "wearers", "F"],
    ["alloc", "allocated_pieces", "pieces", "G"],
    ["scan", "active_assets_scanned", "pieces", "H"],
    ["wpcs", "washed_pieces", "pieces", "I"],
    ["ppcs", "packed_pieces", "pieces", "J"],
    ["kg", "customer_washed_kg", "kg", "L"],
    ["req", "service_requests", "requests", "M"],
  ];
  /** saSrc[site][month][product][metric] -> source id */
  const saSrc = new Map<string, Map<string, Map<string, Record<string, string>>>>();
  for (const r of sa) {
    const site = str(r, "site_id");
    const month = str(r, "month");
    const product = str(r, "product_id");
    assert(MONTHS.includes(month), `Service_Activity row ${r.__row}: month ${month} outside ${YEAR}`);
    assert(siteIds.has(site), `Service_Activity row ${r.__row}: site ${site} not a site of ${customerId}`);
    const ids: Record<string, string> = {};
    for (const [key, col, unit, letter] of SA_COLS) {
      ids[key] = addSource(
        `src:sa:${site}:${month}:${product}:${key}`,
        "service_activity",
        site,
        month,
        num(r, col, "Service_Activity"),
        unit,
        `Service_Activity!${letter}${r.__row}`,
        "period",
        str(r, "data_status"),
      );
    }
    const byMonth = saSrc.get(site) ?? new Map();
    const byProduct = byMonth.get(month) ?? new Map();
    assert(!byProduct.has(product), `Service_Activity: duplicate ${site}/${month}/${product}`);
    byProduct.set(product, ids);
    byMonth.set(month, byProduct);
    saSrc.set(site, byMonth);
  }

  /** rpSrc[site][month] -> list of {product, type, id} */
  const repairTypes = [...new Set(rp.map((r) => str(r, "repair_type")))].sort();
  const rpSrc = new Map<string, Map<string, { product: string; type: string; id: string }[]>>();
  for (const r of rp) {
    const site = str(r, "site_id");
    const month = str(r, "month");
    assert(MONTHS.includes(month), `Repairs row ${r.__row}: month ${month} outside ${YEAR}`);
    assert(siteIds.has(site), `Repairs row ${r.__row}: site ${site} not a site of ${customerId}`);
    const product = str(r, "product_id");
    const type = str(r, "repair_type");
    const id = addSource(
      `src:rp:${site}:${month}:${product}:${slug(type)}`,
      "repair_record",
      site,
      month,
      num(r, "repair_count", "Repairs"),
      "repairs",
      `Repairs!G${r.__row}`,
      "period",
      str(r, "data_status"),
    );
    const byMonth = rpSrc.get(site) ?? new Map();
    byMonth.set(month, [...(byMonth.get(month) ?? []), { product, type, id }]);
    rpSrc.set(site, byMonth);
  }

  /** Service cycles are events; they enter as per site-month aggregates with the row list hashed. */
  const cyclesBy = new Map<string, { n: number; late: number; hours: number; ids: string[] }>();
  let cyclesOutsideYear = 0;
  let cyclesTotal = 0;
  for (const r of pack.serviceCycles) {
    const site = str(r, "site_id");
    if (!siteIds.has(site)) continue;
    cyclesTotal++;
    const month = str(r, "pickup_timestamp").slice(0, 7);
    if (!MONTHS.includes(month)) {
      cyclesOutsideYear++;
      continue;
    }
    const k = `${site}|${month}`;
    const a = cyclesBy.get(k) ?? { n: 0, late: 0, hours: 0, ids: [] };
    a.n++;
    if (str(r, "performance_flag") !== "ON_TIME") a.late++;
    a.hours += num(r, "cycle_hours", "Service_Cycles");
    a.ids.push(`${str(r, "asset_id")}#${r.cycle_number}`);
    cyclesBy.set(k, a);
  }
  const cycSrc = new Map<string, { n: string; late: string; hours: string }>();
  for (const [k, a] of cyclesBy) {
    const [site, month] = k.split("|") as [string, string];
    const ref = `Service_Cycles[site_id=${site}, pickup month=${month}] · ${a.n} rows`;
    const mk = (m: string, v: number, unit: string) =>
      addSource(`src:sc:${site}:${month}:${m}`, "service_cycles", site, month, v, unit, ref, "period", "SYNTHETIC", a.ids);
    cycSrc.set(k, { n: mk("n", a.n, "cycles"), late: mk("late", a.late, "cycles"), hours: mk("hours", a.hours, "hours") });
  }

  const LR_COLS: [string, string, string, string][] = [
    ["kg", "washed_kg", "kg", "E"],
    ["water", "fresh_water_l", "l", "H"],
    ["energy", "process_energy_kwh", "kWh", "G"],
    ["proc", "process_emissions_kgco2e", "kgCO2e", "J"],
    ["deliv", "delivery_emissions_kgco2e", "kgCO2e", "K"],
  ];
  const WC_COLS: [string, string, string][] = [
    ["rec", "recycling_kg", "C"],
    ["reuse", "reuse_kg", "D"],
    ["erec", "energy_recovery_kg", "E"],
    ["inc", "incineration_kg", "F"],
  ];
  const lrSrc = new Map<string, Record<string, string>>();
  const wcSrc = new Map<string, Record<string, string>>();
  for (const r of pack.laundryResources) {
    const l = str(r, "laundry_id");
    if (!laundryIds.includes(l)) continue;
    const month = str(r, "month");
    const ids: Record<string, string> = {};
    for (const [k, col, unit, letter] of LR_COLS) {
      ids[k] = addSource(`src:lr:${l}:${month}:${k}`, "laundry_resource", undefined, month, num(r, col, "Laundry_Resources"), unit, `Laundry_Resources!${letter}${r.__row}`, "period", str(r, "data_status"));
    }
    lrSrc.set(`${l}|${month}`, ids);
  }
  for (const r of pack.wasteCircularity) {
    const l = str(r, "laundry_id");
    if (!laundryIds.includes(l)) continue;
    const month = str(r, "month");
    const ids: Record<string, string> = {};
    for (const [k, col, letter] of WC_COLS) {
      ids[k] = addSource(`src:wc:${l}:${month}:${k}`, "waste_record", undefined, month, num(r, col, "Waste_Circularity"), "kg", `Waste_Circularity!${letter}${r.__row}`, "period", str(r, "data_status"));
    }
    wcSrc.set(`${l}|${month}`, ids);
  }

  // ------------------------------------------------------------------ factors
  const factors: Factor[] = [];
  const addFactor = (f: Omit<Factor, "validFrom" | "version" | "kind"> & { kind?: Factor["kind"] }) =>
    factors.push({ version: "v1", validFrom: `${YEAR}-01-01`, kind: "estimated", ...f });
  const productIdsUsed = [...new Set(sa.map((r) => str(r, "product_id")))].sort();
  for (const pid of productIdsUsed) {
    const p = productInfo.get(pid);
    assert(p, `product ${pid} missing from Products`);
    addFactor({ id: `fac:prod-footprint:${pid}`, name: `Product footprint, ${str(p, "product_name")}`, value: num(p, "synthetic_product_footprint_kgco2e", "Products"), unit: "kgCO2e/piece", sourceRef: `Products!E${p.__row} (synthetic, assumption A005)` });
    addFactor({ id: `fac:prod-cost:${pid}`, name: `Purchase cost, ${str(p, "product_name")}`, value: num(p, "synthetic_purchase_cost_eur", "Products"), unit: "EUR/piece", sourceRef: `Products!F${p.__row} (synthetic)` });
  }
  const BL_PARAMS: [string, string, string][] = [
    ["water", "water_l_per_kg", "l/kg"],
    ["energy", "energy_kwh_per_kg", "kWh/kg"],
    ["proc", "process_kgco2e_per_kg", "kgCO2e/kg"],
    ["deliv", "delivery_kgco2e_per_kg", "kgCO2e/kg"],
  ];
  for (const b of pack.baselines) {
    for (const sc of SCENARIOS) {
      for (const [k, col, unit] of BL_PARAMS) {
        addFactor({
          id: `fac:bl:${str(b, "baseline_id")}:${k}:${sc}`,
          name: `${str(b, "baseline_name")}, ${col.replace(/_/g, " ")} (${sc})`,
          value: round(num(b, col, "Baselines") * BASELINE_BAND[sc], 6),
          unit,
          sourceRef: `Baselines row ${b.__row} × ${BASELINE_BAND[sc]} (${sc} band is a prototype assumption)`,
        });
      }
    }
  }
  for (const sc of SCENARIOS) {
    addFactor({ id: `fac:repair-ratio:${sc}`, name: `Replacements postponed per repair (${sc})`, value: REPAIR_RATIO[sc], unit: "ratio", sourceRef: "Assumptions A002 (low = half-strength test; no evidence for >1)" });
  }

  const idx = buildIndex({ sources, factors } as never);
  const cust: Scope = { customerId };
  const siteScope = (s: string): Scope => ({ customerId, siteId: s });

  // ---------------------------------------------------------------- measures
  type Agg = "sum" | "avg";
  const sumF = (ids: string[], prefix = "a") => ({
    formula: ids.length ? ids.map((_, i) => `${prefix}${i + 1}`).join(" + ") : "0",
    bindings: Object.fromEntries(ids.map((id, i) => [`${prefix}${i + 1}`, id])),
  });
  const avgF = (ids: string[]) => {
    const f = sumF(ids);
    return { formula: `(${f.formula}) / ${ids.length}`, bindings: f.bindings };
  };
  const put = (
    metric: string,
    label: string,
    scopeKey: string,
    scope: Scope,
    period: string,
    unit: string,
    f: { formula: string; bindings: Record<string, string> },
    opts: { variant?: string; status?: "synthetic" | "calculated" | "allocated" | "estimated"; confidence?: "measured" | "estimated" | "proxy" } = {},
  ): string => {
    const id = mid(metric, scopeKey, period, opts.variant);
    addMeasure(idx, {
      id,
      metricId: metric,
      label,
      scope,
      period: periodOf(period),
      unit,
      formula: f.formula,
      bindings: f.bindings,
      confidence: opts.confidence ?? "measured",
      status: opts.status ?? "calculated",
    });
    return id;
  };

  const LABEL: Record<string, [string, string]> = {
    kg: ["Washed kg", "kg"],
    req: ["Service requests", "requests"],
    wpcs: ["Washed pieces", "pieces"],
    ppcs: ["Packed pieces", "pieces"],
    rep: ["Repairs completed", "repairs"],
    wearers: ["Active wearers", "wearers"],
    alloc: ["Garments allocated", "pieces"],
    scan: ["Garments scanned in use", "pieces"],
    cyc: ["Service cycles", "cycles"],
    late: ["Late cycles", "cycles"],
    cych: ["Cycle hours (sum)", "hours"],
    a_water: ["Fresh water allocated", "l"],
    a_energy: ["Process energy allocated", "kWh"],
    a_proc: ["Process emissions allocated", "kgCO2e"],
    a_deliv: ["Delivery emissions allocated", "kgCO2e"],
    w_rec: ["Textile waste recycled", "kg"],
    w_reuse: ["Textile waste reused", "kg"],
    w_erec: ["Textile waste to energy recovery", "kg"],
    w_inc: ["Textile waste incinerated", "kg"],
  };
  const AGG: Record<string, Agg> = { wearers: "avg", alloc: "avg", scan: "avg" };
  const STATUS: Record<string, "synthetic" | "calculated" | "allocated"> = {
    a_water: "allocated", a_energy: "allocated", a_proc: "allocated", a_deliv: "allocated",
    w_rec: "allocated", w_reuse: "allocated", w_erec: "allocated", w_inc: "allocated",
  };
  const label = (m: string) => LABEL[m]![0];
  const unitOf = (m: string) => LABEL[m]![1];

  // laundry-month intensities (per washed kg of the whole laundry)
  const INT: [string, string, "lr" | "wc"][] = [
    ["a_water", "water", "lr"], ["a_energy", "energy", "lr"], ["a_proc", "proc", "lr"], ["a_deliv", "deliv", "lr"],
    ["w_rec", "rec", "wc"], ["w_reuse", "reuse", "wc"], ["w_erec", "erec", "wc"], ["w_inc", "inc", "wc"],
  ];
  const intId = (metric: string, laundry: string, month: string) => `mea:int_${metric}:${laundry}:${month}`;
  for (const l of laundryIds) {
    for (const month of MONTHS) {
      const lr = lrSrc.get(`${l}|${month}`);
      const wc = wcSrc.get(`${l}|${month}`);
      assert(lr && wc, `Laundry_Resources / Waste_Circularity: no row for ${l} ${month}`);
      for (const [metric, k, sheet] of INT) {
        const srcId = (sheet === "lr" ? lr : wc)[k]!;
        const id = intId(metric, l, month);
        addMeasure(idx, {
          id,
          metricId: `int_${metric}`,
          label: `${label(metric)} per washed kg at laundry`,
          scope: { customerId, laundryId: l },
          period: monthPeriod(month),
          unit: `${unitOf(metric)}/kg`,
          formula: "x / kg",
          bindings: { x: srcId, kg: lr.kg! },
          confidence: "measured",
          status: "calculated",
        });
      }
    }
  }

  // site-month
  const siteMonthProducts = (s: string, m: string) => [...(saSrc.get(s)?.get(m)?.entries() ?? [])];
  for (const s of siteIds) {
    const sc = siteScope(s);
    for (const m of MONTHS) {
      const prods = siteMonthProducts(s, m);
      assert(prods.length > 0, `Service_Activity: no rows for ${s} ${m}`);
      const of = (key: string) => prods.map(([, ids]) => ids[key]!);
      for (const metric of ["kg", "req", "wpcs", "ppcs", "alloc", "scan"]) {
        put(metric, label(metric), s, sc, m, unitOf(metric), sumF(of(metric)), { status: "synthetic" });
      }
      const w = of("wearers");
      put("wearers", label("wearers"), s, sc, m, "wearers", { formula: `max(${w.map((_, i) => `a${i + 1}`).join(", ")})`, bindings: sumF(w).bindings }, { status: "calculated" });
      put("rep", label("rep"), s, sc, m, "repairs", sumF((rpSrc.get(s)?.get(m) ?? []).map((x) => x.id)), { status: "synthetic" });
      const laundry = siteRows.find((x) => str(x, "site_id") === s)!;
      const l = str(laundry, "primary_laundry_id");
      for (const [metric] of INT) {
        put(metric, label(metric), s, sc, m, unitOf(metric), { formula: "kg * i", bindings: { kg: mid("kg", s, m), i: intId(metric, l, m) } }, { status: "allocated" });
      }
    }
  }

  // roll-ups: quarters from months, FY from quarters
  const SITE_METRICS = ["kg", "req", "wpcs", "ppcs", "alloc", "scan", "wearers", "rep", "a_water", "a_energy", "a_proc", "a_deliv", "w_rec", "w_reuse", "w_erec", "w_inc"];
  const rollSite = (metric: string, s: string) => {
    const agg = AGG[metric] ?? "sum";
    const sc = siteScope(s);
    const st = STATUS[metric] ?? "calculated";
    for (const q of QUARTERS) {
      const ids = QUARTER_MONTHS[q]!.map((m) => mid(metric, s, m));
      put(metric, label(metric), s, sc, q, unitOf(metric), agg === "avg" ? avgF(ids) : sumF(ids), { status: st });
    }
    const qs = QUARTERS.map((q) => mid(metric, s, q));
    put(metric, label(metric), s, sc, `${YEAR}-FY`, unitOf(metric), agg === "avg" ? avgF(qs) : sumF(qs), { status: st });
  };
  for (const s of siteIds) for (const metric of SITE_METRICS) rollSite(metric, s);

  // service cycles: quarter bound straight to the per-month aggregates
  for (const s of siteIds) {
    const sc = siteScope(s);
    for (const [metric, key] of [["cyc", "n"], ["late", "late"], ["cych", "hours"]] as const) {
      for (const q of QUARTERS) {
        const ids = QUARTER_MONTHS[q]!.map((m) => cycSrc.get(`${s}|${m}`)?.[key]).filter((x): x is string => !!x);
        put(metric, label(metric), s, sc, q, unitOf(metric), sumF(ids), { status: "synthetic" });
      }
      put(metric, label(metric), s, sc, `${YEAR}-FY`, unitOf(metric), sumF(QUARTERS.map((q) => mid(metric, s, q))), { status: "synthetic" });
    }
  }

  // by product / by repair type (site level, quarter + FY)
  const sitesOfProduct = (p: string) => [...siteIds].filter((s) => [...(saSrc.get(s)?.values() ?? [])].some((byP) => byP.has(p)));
  const rpOf = (s: string, months: string[], pred: (x: { product: string; type: string }) => boolean) =>
    months.flatMap((m) => (rpSrc.get(s)?.get(m) ?? []).filter(pred).map((x) => x.id));
  for (const s of siteIds) {
    const sc = siteScope(s);
    const prods = [...new Set([...(saSrc.get(s)?.values() ?? [])].flatMap((m) => [...m.keys()]))].sort();
    for (const p of prods) {
      const key = `${s}.${p}`;
      const psc: Scope = { ...sc, productId: p };
      for (const metric of ["kg", "alloc", "scan"]) {
        const agg = AGG[metric] ?? "sum";
        for (const q of QUARTERS) {
          const ids = QUARTER_MONTHS[q]!.map((m) => saSrc.get(s)!.get(m)!.get(p)![metric]!);
          put(`${metric}_p`, label(metric), key, psc, q, unitOf(metric), agg === "avg" ? avgF(ids) : sumF(ids), { status: "synthetic" });
        }
        const qs = QUARTERS.map((q) => mid(`${metric}_p`, key, q));
        put(`${metric}_p`, label(metric), key, psc, `${YEAR}-FY`, unitOf(metric), agg === "avg" ? avgF(qs) : sumF(qs), { status: "calculated" });
      }
      for (const q of QUARTERS) {
        put("rep_p", label("rep"), key, psc, q, "repairs", sumF(rpOf(s, QUARTER_MONTHS[q]!, (x) => x.product === p)), { status: "synthetic" });
      }
      put("rep_p", label("rep"), key, psc, `${YEAR}-FY`, "repairs", sumF(QUARTERS.map((q) => mid("rep_p", key, q))), { status: "calculated" });
    }
    for (const t of repairTypes) {
      const key = `${s}.${slug(t)}`;
      const tsc: Scope = { ...sc, slice: t };
      for (const q of QUARTERS) {
        put("rep_t", `Repairs: ${t}`, key, tsc, q, "repairs", sumF(rpOf(s, QUARTER_MONTHS[q]!, (x) => x.type === t)), { status: "synthetic" });
      }
      put("rep_t", `Repairs: ${t}`, key, tsc, `${YEAR}-FY`, "repairs", sumF(QUARTERS.map((q) => mid("rep_t", key, q))), { status: "calculated" });
    }
  }

  // repair handprint, per scenario (site level, then customer)
  const REPAIR_SITE_METRICS = ["rep_postponed", "rep_avoided_co2", "rep_avoided_eur"] as const;
  const repairUnit = { rep_postponed: "replacements", rep_avoided_co2: "kgCO2e", rep_avoided_eur: "EUR" } as const;
  const repairLabel = { rep_postponed: "Replacements postponed (est.)", rep_avoided_co2: "Avoided product emissions (est.)", rep_avoided_eur: "Avoided purchase cost (est.)" } as const;
  for (const s of siteIds) {
    const sc = siteScope(s);
    const prods = [...new Set([...(saSrc.get(s)?.values() ?? [])].flatMap((m) => [...m.keys()]))].sort();
    for (const scen of SCENARIOS) {
      const ratio = `fac:repair-ratio:${scen}@v1`;
      for (const q of QUARTERS) {
        put("rep_postponed", repairLabel.rep_postponed, s, sc, q, "replacements", { formula: "rep * ratio", bindings: { rep: mid("rep", s, q), ratio } }, { variant: scen, status: "estimated", confidence: "estimated" });
        const terms = prods.map((_, i) => `r${i} * f${i}`);
        const bind = (kind: "footprint" | "cost") => ({
          ratio,
          ...Object.fromEntries(prods.flatMap((p, i) => [[`r${i}`, mid("rep_p", `${s}.${p}`, q)], [`f${i}`, `fac:prod-${kind}:${p}@v1`]])),
        });
        put("rep_avoided_co2", repairLabel.rep_avoided_co2, s, sc, q, "kgCO2e", { formula: `(${terms.join(" + ")}) * ratio`, bindings: bind("footprint") }, { variant: scen, status: "estimated", confidence: "estimated" });
        put("rep_avoided_eur", repairLabel.rep_avoided_eur, s, sc, q, "EUR", { formula: `(${terms.join(" + ")}) * ratio`, bindings: bind("cost") }, { variant: scen, status: "estimated", confidence: "estimated" });
      }
      for (const m of REPAIR_SITE_METRICS) {
        put(m, repairLabel[m], s, sc, `${YEAR}-FY`, repairUnit[m], sumF(QUARTERS.map((q) => mid(m, s, q, scen))), { variant: scen, status: "estimated", confidence: "estimated" });
      }
    }
  }

  // baseline comparison, per baseline × scenario (site level)
  const CMP = ["cmp_water", "cmp_energy", "cmp_co2", "sav_water", "sav_energy", "sav_co2"] as const;
  const cmpLabel: Record<(typeof CMP)[number], [string, string]> = {
    cmp_water: ["Water the alternative would use", "l"],
    cmp_energy: ["Energy the alternative would use", "kWh"],
    cmp_co2: ["Emissions the alternative would cause", "kgCO2e"],
    sav_water: ["Water saving vs. alternative", "l"],
    sav_energy: ["Energy saving vs. alternative", "kWh"],
    sav_co2: ["Emission saving vs. alternative", "kgCO2e"],
  };
  const variantOf = (b: string, scen: string) => `${b}.${scen}`;
  for (const s of siteIds) {
    const sc = siteScope(s);
    for (const b of BASELINE_IDS) {
      for (const scen of SCENARIOS) {
        const v = variantOf(b, scen);
        const f = (k: string) => `fac:bl:${b}:${k}:${scen}@v1`;
        for (const period of [...QUARTERS, `${YEAR}-FY`]) {
          const opt = { variant: v, status: "estimated" as const, confidence: "proxy" as const };
          const kg = mid("kg", s, period);
          put("cmp_water", cmpLabel.cmp_water[0], s, sc, period, "l", { formula: "kg * w", bindings: { kg, w: f("water") } }, opt);
          put("cmp_energy", cmpLabel.cmp_energy[0], s, sc, period, "kWh", { formula: "kg * e", bindings: { kg, e: f("energy") } }, opt);
          put("cmp_co2", cmpLabel.cmp_co2[0], s, sc, period, "kgCO2e", { formula: "kg * (p + d)", bindings: { kg, p: f("proc"), d: f("deliv") } }, opt);
          put("sav_water", cmpLabel.sav_water[0], s, sc, period, "l", { formula: "base - actual", bindings: { base: mid("cmp_water", s, period, v), actual: mid("a_water", s, period) } }, opt);
          put("sav_energy", cmpLabel.sav_energy[0], s, sc, period, "kWh", { formula: "base - actual", bindings: { base: mid("cmp_energy", s, period, v), actual: mid("a_energy", s, period) } }, opt);
          put("sav_co2", cmpLabel.sav_co2[0], s, sc, period, "kgCO2e", { formula: "base - proc - deliv", bindings: { base: mid("cmp_co2", s, period, v), proc: mid("a_proc", s, period), deliv: mid("a_deliv", s, period) } }, opt);
        }
      }
    }
  }

  // customer level: sums of site measures, same ids with the customer as scope key
  const custSum = (metric: string, period: string, variant?: string, extraSites?: string[], keyOf?: (s: string) => string, unit?: string, lbl?: string, scope?: Scope, status?: "synthetic" | "calculated" | "allocated" | "estimated", confidence?: "measured" | "estimated" | "proxy", scopeKey?: string) => {
    const ids = (extraSites ?? [...siteIds]).map((s) => mid(metric, keyOf ? keyOf(s) : s, period, variant));
    const base = metric.replace(/_p$|_t$/, "");
    const name = lbl ?? (LABEL[base]?.[0] ?? metric);
    put(metric, name, scopeKey ?? customerId, scope ?? cust, period, unit ?? unitOf(base), sumF(ids), { variant, status, confidence });
  };
  const allPeriods = [...QUARTERS, `${YEAR}-FY`];
  const NOMONTH = ["cyc", "late", "cych"];
  for (const metric of [...SITE_METRICS, ...NOMONTH]) {
    const agg = AGG[metric] ?? "sum";
    for (const q of QUARTERS) custSum(metric, q, undefined, undefined, undefined, undefined, undefined, undefined, STATUS[metric] ?? (NOMONTH.includes(metric) ? "synthetic" : "calculated"));
    // FY = quarters (customer level) so the hierarchy reads the same at both levels
    const qs = QUARTERS.map((q) => mid(metric, customerId, q));
    put(metric, label(metric), customerId, cust, `${YEAR}-FY`, unitOf(metric), agg === "avg" ? avgF(qs) : sumF(qs), { status: STATUS[metric] ?? "calculated" });
  }
  for (const metric of ["kg", "req", "rep", "wearers", "alloc", "scan"]) {
    for (const m of MONTHS) custSum(metric, m, undefined, undefined, undefined, undefined, undefined, undefined, "calculated");
  }
  for (const p of productIdsUsed) {
    const sites = sitesOfProduct(p);
    const pscope: Scope = { ...cust, productId: p };
    for (const metric of ["kg_p", "alloc_p", "scan_p", "rep_p"]) {
      for (const q of QUARTERS) custSum(metric, q, undefined, sites, (s) => `${s}.${p}`, undefined, undefined, pscope, "calculated", undefined, `${customerId}.${p}`);
      const qs = QUARTERS.map((q) => mid(metric, `${customerId}.${p}`, q));
      put(metric, label(metric.replace("_p", "")), `${customerId}.${p}`, pscope, `${YEAR}-FY`, unitOf(metric.replace("_p", "")), (AGG[metric.replace("_p", "")] ?? "sum") === "avg" ? avgF(qs) : sumF(qs), { status: "calculated" });
    }
  }
  for (const t of repairTypes) {
    const tscope: Scope = { ...cust, slice: t };
    for (const q of QUARTERS) custSum("rep_t", q, undefined, undefined, (s) => `${s}.${slug(t)}`, "repairs", `Repairs: ${t}`, tscope, "calculated", undefined, `${customerId}.${slug(t)}`);
    const qs = QUARTERS.map((q) => mid("rep_t", `${customerId}.${slug(t)}`, q));
    put("rep_t", `Repairs: ${t}`, `${customerId}.${slug(t)}`, tscope, `${YEAR}-FY`, "repairs", sumF(qs), { status: "calculated" });
  }
  for (const scen of SCENARIOS) {
    for (const m of REPAIR_SITE_METRICS) {
      for (const q of QUARTERS) custSum(m, q, scen, undefined, undefined, repairUnit[m], repairLabel[m], undefined, "estimated", "estimated");
      put(m, repairLabel[m], customerId, cust, `${YEAR}-FY`, repairUnit[m], sumF(QUARTERS.map((q) => mid(m, customerId, q, scen))), { variant: scen, status: "estimated", confidence: "estimated" });
    }
  }
  for (const b of BASELINE_IDS) {
    for (const scen of SCENARIOS) {
      const v = variantOf(b, scen);
      for (const m of CMP) {
        for (const q of QUARTERS) custSum(m, q, v, undefined, undefined, cmpLabel[m][1], cmpLabel[m][0], undefined, "estimated", "proxy");
        put(m, cmpLabel[m][0], customerId, cust, `${YEAR}-FY`, cmpLabel[m][1], sumF(QUARTERS.map((q) => mid(m, customerId, q, v))), { variant: v, status: "estimated", confidence: "proxy" });
      }
    }
  }

  // derived ratios, for every scope × period
  const scopes: [string, Scope][] = [[customerId, cust], ...[...siteIds].map((s): [string, Scope] => [s, siteScope(s)])];
  for (const [key, scope] of scopes) {
    for (const period of allPeriods) {
      const g = (m: string, v?: string) => mid(m, key, period, v);
      const ratio = (metric: string, lbl: string, unit: string, formula: string, bindings: Record<string, string>, status: "calculated" | "allocated" | "estimated" = "calculated") =>
        put(metric, lbl, key, scope, period, unit, { formula, bindings }, { status });
      ratio("util_pct", "Garment utilisation (scanned ÷ allocated)", "%", "scan / alloc * 100", { scan: g("scan"), alloc: g("alloc") });
      ratio("unused", "Allocated but not scanned", "pieces", "alloc - scan", { alloc: g("alloc"), scan: g("scan") });
      ratio("pcs_per_wearer", "Garments per wearer", "garments/wearer", "alloc / w", { alloc: g("alloc"), w: g("wearers") });
      ratio("req_per_1k", "Service requests per 1 000 wearers", "requests", "req / w * 1000", { req: g("req"), w: g("wearers") });
      ratio("on_time_pct", "Cycles on time", "%", "(n - late) / n * 100", { n: g("cyc"), late: g("late") });
      ratio("avg_cycle_h", "Average cycle time", "hours", "h / n", { h: g("cych"), n: g("cyc") });
      ratio("rep_per_100", "Repairs per 100 wearers", "repairs", "rep / w * 100", { rep: g("rep"), w: g("wearers") });
      ratio("a_co2", "Emissions allocated (process + delivery)", "kgCO2e", "p + d", { p: g("a_proc"), d: g("a_deliv") }, "allocated");
      ratio("water_per_kg", "Fresh water per washed kg", "l/kg", "w / kg", { w: g("a_water"), kg: g("kg") }, "allocated");
      ratio("w_total", "Textile waste attributed", "kg", "a + b + c + d", { a: g("w_rec"), b: g("w_reuse"), c: g("w_erec"), d: g("w_inc") }, "allocated");
      ratio("w_div_pct", "Textile waste kept out of incineration", "%", "(a + b + c) / (a + b + c + d) * 100", { a: g("w_rec"), b: g("w_reuse"), c: g("w_erec"), d: g("w_inc") }, "allocated");
      for (const b of BASELINE_IDS) {
        for (const scen of SCENARIOS) {
          const v = variantOf(b, scen);
          const opt = { variant: v, status: "estimated" as const, confidence: "proxy" as const };
          put("sav_water_pct", "Water saving vs. alternative", key, scope, period, "%", { formula: "s / c * 100", bindings: { s: g("sav_water", v), c: g("cmp_water", v) } }, opt);
          put("sav_energy_pct", "Energy saving vs. alternative", key, scope, period, "%", { formula: "s / c * 100", bindings: { s: g("sav_energy", v), c: g("cmp_energy", v) } }, opt);
          put("sav_co2_pct", "Emission saving vs. alternative", key, scope, period, "%", { formula: "s / c * 100", bindings: { s: g("sav_co2", v), c: g("cmp_co2", v) } }, opt);
        }
      }
    }
  }

  // Garments above what the customer's own average utilisation would need at each site.
  for (const period of allPeriods) {
    const u = mid("util_pct", customerId, period);
    for (const s of siteIds) {
      put("excess_pieces", "Garments above customer-average utilisation", s, siteScope(s), period, "pieces", { formula: "max(0, alloc - scan * 100 / u)", bindings: { alloc: mid("alloc", s, period), scan: mid("scan", s, period), u } }, { status: "calculated" });
    }
    put("excess_pieces", "Garments above customer-average utilisation", customerId, cust, period, "pieces", sumF([...siteIds].map((s) => mid("excess_pieces", s, period))), { status: "calculated" });
    for (const t of repairTypes) {
      const k = `${customerId}.${slug(t)}`;
      put("rep_t_share", `Share of repairs: ${t}`, k, { ...cust, slice: t }, period, "%", { formula: "t / all * 100", bindings: { t: mid("rep_t", k, period), all: mid("rep", customerId, period) } }, { status: "calculated" });
    }
  }

  // Capital tied in unscanned garments: per-product (allocated - scanned) × synthetic purchase cost.
  const costOf = (p: string) => `fac:prod-cost:${p}@v1`;
  for (const [key, scope] of scopes) {
    const prods = key === customerId ? productIdsUsed : [...new Set([...(saSrc.get(key)?.values() ?? [])].flatMap((m) => [...m.keys()]))].sort();
    for (const period of allPeriods) {
      const id = mid("unused_cost", key, period);
      // priced per product from site-product alloc/scan where available
      const terms: string[] = [];
      const bind: Record<string, string> = {};
      const sitesFor = (p: string) => (key === customerId ? sitesOfProduct(p) : [key]);
      prods.forEach((p, i) => {
        const pk = key === customerId ? `${customerId}.${p}` : `${key}.${p}`;
        if (sitesFor(p).length === 0) return;
        bind[`al${i}`] = mid("alloc_p", pk, period);
        bind[`sc${i}`] = mid("scan_p", pk, period);
        bind[`c${i}`] = costOf(p);
        terms.push(`(al${i} - sc${i}) * c${i}`);
      });
      addMeasure(idx, {
        id,
        metricId: "unused_cost",
        label: "Capital tied in unscanned garments (est.)",
        scope,
        period: periodOf(period),
        unit: "EUR",
        formula: terms.length ? terms.join(" + ") : "0",
        bindings: bind,
        confidence: "estimated",
        status: "estimated",
      });
    }
  }

  const measures = [...idx.measures.values()];

  // ------------------------------------------------- independent reconciliation
  const impacts = pack.customerImpacts.filter((r) => str(r, "customer_id") === customerId);
  const sumCol = (col: string) => impacts.reduce((a, r) => a + num(r, col, "Customer_Impacts"), 0);
  const fy = `${YEAR}-FY`;
  const val = (id: string) => idx.measures.get(id)!.value;
  const recon: Reconciliation[] = [
    ["Washed kg", val(mid("kg", customerId, fy)), sumCol("customer_washed_kg")],
    ["Fresh water allocated (l)", val(mid("a_water", customerId, fy)), sumCol("allocated_water_l")],
    ["Process energy allocated (kWh)", val(mid("a_energy", customerId, fy)), sumCol("allocated_energy_kwh")],
    ["Textile waste attributed (kg)", val(mid("w_total", customerId, fy)), sumCol("allocated_textile_waste_kg")],
    ["Water saving vs. local laundry, base (l)", val(mid("sav_water", customerId, fy, "B_LOCAL.base")), sumCol("water_saving_vs_local_l")],
    ["Energy saving vs. local laundry, base (kWh)", val(mid("sav_energy", customerId, fy, "B_LOCAL.base")), sumCol("energy_saving_vs_local_kwh")],
    ["Emission saving vs. local laundry, base (kgCO2e)", val(mid("sav_co2", customerId, fy, "B_LOCAL.base")), sumCol("emissions_saving_vs_local_kgco2e")],
  ].map(([check, ours, pk]) => ({
    check: check as string,
    ours: ours as number,
    pack: pk as number,
    relDiff: Math.abs((ours as number) - (pk as number)) / Math.max(1, Math.abs(pk as number)),
  }));

  // -------------------------------------------------------------------- gaps
  const gaps: DataGap[] = [];
  const unmappedSa = pack.serviceActivity.filter((r) => !pack.sites.some((s) => str(s, "site_id") === str(r, "site_id"))).length;
  const unmappedRp = pack.repairs.filter((r) => !pack.sites.some((s) => str(s, "site_id") === str(r, "site_id"))).length;
  gaps.push({
    id: "gap:unmapped",
    severity: unmappedSa + unmappedRp === 0 ? "info" : "gap",
    text: `Unmapped records: ${unmappedSa} service-activity and ${unmappedRp} repair rows have no matching site (0 means every row joined).`,
  });
  if (cyclesOutsideYear > 0) {
    gaps.push({ id: "gap:cycles-outside", severity: "limit", text: `${cyclesOutsideYear} of ${cyclesTotal} service cycles were picked up outside ${YEAR} and are excluded.` });
  }
  gaps.push(
    { id: "gap:wearers", severity: "limit", text: "Active wearers are counted per site as the highest product-level count in a month: one wearer holds several garment types, so summing products would double-count. The pack does not carry a wearer id." },
    { id: "gap:cost", severity: "gap", text: "The pack has no service price or invoice data, so cost is shown only as garment capital tied up in unused allocation, priced at synthetic purchase cost. Real contract and invoice data is needed for a true cost view." },
    { id: "gap:water-site", severity: "limit", text: "Water and emissions are laundry-level figures allocated to the customer by washed-kg share. They are not metered at customer or site level." },
    { id: "gap:waste", severity: "limit", text: "Textile waste is allocated the same way. The pack has no emission factor per waste route, so waste is reported in kg and diversion %, not as CO2e." },
    { id: "gap:repair", severity: "limit", text: "Repair handprint assumes one completed repair postpones one replacement (assumption A002). It is shown as low/base/high and is not an audited avoided-purchase claim." },
    { id: "gap:baseline", severity: "limit", text: "Baselines are single illustrative values per alternative; the ±20% low/high band is a prototype assumption, not Lindström data." },
    { id: "gap:hierarchy", severity: "info", text: "Customer and site hierarchy is synthetic. Mapping real parent accounts to delivery customers is outside the prototype." },
  );

  return {
    customerId,
    customerName: str(customer, "customer_name"),
    industry: str(customer, "industry"),
    sites: siteRows.map((s) => ({
      id: str(s, "site_id"),
      name: str(s, "site_name"),
      city: str(s, "city"),
      country: str(s, "country"),
      type: str(s, "site_type"),
      laundryId: str(s, "primary_laundry_id"),
      productIds: [...new Set([...(saSrc.get(str(s, "site_id"))?.values() ?? [])].flatMap((m) => [...m.keys()]))].sort(),
    })),
    products: productIdsUsed.map((id) => {
      const p = productInfo.get(id)!;
      return { id, name: str(p, "product_name"), group: str(p, "product_group"), footprint: num(p, "synthetic_product_footprint_kgco2e", "Products"), cost: num(p, "synthetic_purchase_cost_eur", "Products") };
    }),
    laundries: laundryIds.map((id) => {
      const l = pack.laundries.find((x) => str(x, "laundry_id") === id)!;
      return { id, name: str(l, "laundry_name"), country: str(l, "country") };
    }),
    sources,
    factors,
    measures,
    idx,
    repairTypes,
    reconciliation: recon,
    gaps,
  };
}

export type { Row };
