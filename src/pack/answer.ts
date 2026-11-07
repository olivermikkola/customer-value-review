/**
 * Answering questions without a language model.
 *
 * A question is matched to an intent (what is being asked), the entities in it
 * are picked out (sites, period, baseline, metric, "worst/best"), and the answer
 * is composed from the review's own figures. Nothing is generated: every number in
 * a sentence is a Cell of the dashboard's view, so each links to its ledger
 * evidence, and the same question always gives the same answer.
 *
 * Meaning comes from two signals that are added together:
 *   - similarities from a small embedding model in the browser (optional; ~25 MB, CPU),
 *   - word patterns here (always available).
 * Without the embedding model the keywords still work, just with less reach.
 * A question that matches nothing well is not guessed at: the answer says what it
 * understood and offers the closest questions it can answer.
 */
import { NO_DATA } from "./narrate.ts";
import { sitesIn, type Cell, type CustomerView, type Interpretation, type SiteRow } from "./view.ts";

// ------------------------------------------------------------------------------ shapes

export interface Sentence {
  text: string;
  /** The figures the sentence states, for the evidence drawer. */
  cells: Cell[];
  kind?: "fact" | "question" | "note";
}

export interface Answer {
  intent: string;
  label: string;
  confidence: "high" | "medium" | "low";
  /** "no-data": the review cannot answer, and says why. "clarify": the question was too unclear to answer. */
  type: "answer" | "no-data" | "clarify";
  title: string;
  sentences: Sentence[];
  noData?: { reason: string; module?: { name: string; covers: string } };
  followUps: string[];
  /** A change of focus the question asked for; the dashboard offers to apply it. */
  apply?: { priority?: string; baseline?: string; period?: string };
  /** Where on the dashboard the answer lives. */
  focus?: { section: "overview" | "observations" | "comparison" | "sites" | "repairs" | "method"; site?: string };
  read: { via: "meaning and keywords" | "keywords"; matched: string[]; candidates: { intent: string; label: string; score: number }[] };
}

interface Draft {
  title: string;
  sentences: Sentence[];
  focus?: Answer["focus"];
  /** Overrides the intent's default follow-ups. */
  followUps?: string[];
}

interface Ctx {
  v: CustomerView;
  text: string;
  sites: SiteRow[];
  interp: Interpretation;
}

interface Intent {
  id: string;
  label: string;
  /** Phrasings the embedding model compares a question against. Several, in different words. */
  examples: string[];
  kw: RegExp;
  /** Weight of the keyword match relative to the meaning match. */
  kwWeight?: number;
  follow: string[];
  noData?: string;
  run?: (c: Ctx) => Draft;
}

// ----------------------------------------------------------------------- site metrics

type Dir = "high" | "low" | "none";
interface SiteMetric { key: string; noun: string; words: RegExp; better: Dir; ofWhat: string }

/** Metrics a question can rank sites by. `better` says which end is good, for "worst" and "best". */
const METRICS: SiteMetric[] = [
  { key: "on_time_pct", noun: "cycles delivered on time", words: /on[- ]?time|late\w*|punctual\w*|deliver\w*|delay\w*|reliab\w*|timel\w*/i, better: "high", ofWhat: "delivery" },
  { key: "req_per_1k", noun: "service requests per 1 000 wearers", words: /request\w*|complain\w*|ticket\w*|problem\w*|issue\w*|support/i, better: "low", ofWhat: "service requests" },
  { key: "avg_cycle_h", noun: "average cycle time", words: /cycle\w*|turn[- ]?around|lead time|slow\w*|fast\w*|speed\w*/i, better: "low", ofWhat: "cycle time" },
  { key: "util_pct", noun: "garments in active use", words: /utili[sz]\w*|in use|usage|being used|used\b|active/i, better: "high", ofWhat: "garment use" },
  { key: "excess_pieces", noun: "garments above average need", words: /surplus|excess\w*|over-?alloc\w*|too many|extra|stock|idle|unused|spare/i, better: "low", ofWhat: "surplus garments" },
  { key: "unused_cost", noun: "capital in unscanned garments", words: /capital|cost\w*|money|euro\w*|€|value tied|tied up/i, better: "low", ofWhat: "capital tied up" },
  { key: "water_per_kg", noun: "water per washed kg", words: /water|litre\w*|liter\w*|m3|m³/i, better: "low", ofWhat: "water use" },
  { key: "sav_co2_pct", noun: "emissions saving vs. the alternative", words: /emission\w*|co2|carbon|climate|footprint/i, better: "high", ofWhat: "emissions saving" },
  { key: "rep_per_100", noun: "repairs per 100 wearers", words: /repair\w*|mend\w*|fix\w*|damage\w*|wear and tear/i, better: "none", ofWhat: "repairs" },
];

const metricOf = (text: string, fallback = "on_time_pct") => METRICS.find((m) => m.words.test(text)) ?? METRICS.find((m) => m.key === fallback)!;

const HIGHEST = /\b(highest|most|biggest|largest|greatest|top|maximum|more)\b/i;
const LOWEST = /\b(lowest|least|fewest|smallest|minimum|lower)\b/i;
const BEST = /\b(best|strongest|better|excellent|good\b|great|leading)\b/i;
// "worst" is also the default: a question about which site needs attention.

/** The sites ordered so the first is what the question asked for, and which end that is. */
function ranked(v: CustomerView, m: SiteMetric, text: string): { rows: { site: SiteRow; cell: Cell }[]; end: "highest" | "lowest" | "weakest" | "strongest" } {
  const rows = v.sites.flatMap((site) => (site.m[m.key] ? [{ site, cell: site.m[m.key]! }] : []));
  let end: "highest" | "lowest" | "weakest" | "strongest";
  if (HIGHEST.test(text) && !BEST.test(text)) end = "highest";
  else if (LOWEST.test(text)) end = "lowest";
  else if (BEST.test(text)) end = m.better === "none" ? "highest" : "strongest";
  else end = m.better === "none" ? "highest" : "weakest";
  const desc = end === "highest" || (end === "weakest" && m.better === "low") || (end === "strongest" && m.better === "high");
  rows.sort((a, b) => (desc ? b.cell.value - a.cell.value : a.cell.value - b.cell.value));
  return { rows, end };
}

// --------------------------------------------------------------------------- helpers

const S = (text: string, ...cells: Cell[]): Sentence => ({ text, cells, kind: "fact" });
const lc = (s: string) => s.toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const ord = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`;
const names = (rows: { site: SiteRow }[]) => rows.map((r) => r.site.name);
/** "NorthStar Pori" → "Pori" when every site shares the prefix. */
const shortName = (v: CustomerView) => {
  const first = v.sites[0]?.name.split(" ")[0] ?? "";
  return (s: SiteRow) => (v.sites.every((x) => x.name.startsWith(first + " ")) ? s.name.slice(first.length + 1) : s.name);
};
const join = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const cm = (v: CustomerView, k: string): Cell => v.customerMetrics[k]!;
const rowOf = (v: CustomerView, key: string) => v.comparison.rows.find((r) => r.key === key)!;
const base = (v: CustomerView) => lc(v.baselineLabel);

function rankOfSite(v: CustomerView, site: SiteRow, m: SiteMetric): number | null {
  const mine = site.m[m.key];
  if (!mine || m.better === "none") return null;
  const better = v.sites.filter((s) => s.m[m.key] && (m.better === "high" ? s.m[m.key]!.value > mine.value : s.m[m.key]!.value < mine.value)).length;
  return better + 1;
}

// ------------------------------------------------------------------------------ intents

const run = {
  value(c: Ctx): Draft {
    const { v } = c;
    const k = (label: string) => v.kpis.find((x) => x.label === label)!.cell;
    const lead = v.observations[0];
    return {
      title: `The ${lc(v.periodLabel)} in short`,
      focus: { section: "overview" },
      sentences: [
        S(`${k("Active wearers").display} wearers at ${v.customer.siteCount} sites had ${k("Garments in circulation").display} garments in circulation, and ${k("Textiles washed").display} of textiles were washed.`, k("Active wearers"), k("Garments in circulation"), k("Textiles washed")),
        S(`${k("Cycles delivered on time").display} of cycles were delivered on time and ${k("Repairs completed").display} repairs were completed.`, k("Cycles delivered on time"), k("Repairs completed")),
        S(`Compared with ${base(v)}, the service saved an estimated ${k("Water saved vs. alternative").display} of fresh water and ${k("Emissions saved vs. alternative").display} of emissions.`, k("Water saved vs. alternative"), k("Emissions saved vs. alternative")),
        ...(lead ? [S(`Top finding: ${lead.headline}.`, ...lead.evidence.map((e) => e.cell))] : []),
      ],
    };
  },
  water(c: Ctx): Draft {
    const { v } = c;
    const r = rowOf(v, "water");
    const others = v.comparison.byBaseline.filter((b) => lc(b.label) !== base(v));
    return {
      title: "Water",
      focus: { section: "comparison" },
      sentences: [
        S(`The service used an estimated ${r.saving.display} less fresh water than ${base(v)} (${r.pct.display}); the plausible range is ${r.low.display} to ${r.high.display}.`, r.saving, r.pct, r.low, r.high),
        S(`The laundry used ${cm(v, "water_per_kg").display} of washed textile, allocated to this customer by washed-kg share.`, cm(v, "water_per_kg")),
        ...(others.length ? [S(`Against other baselines the saving is ${join(others.map((b) => `${b.waterPct.display} compared with ${lc(b.label)}`))}.`, ...others.map((b) => b.waterPct))] : []),
      ],
    };
  },
  emissions(c: Ctx): Draft {
    const { v } = c;
    const r = rowOf(v, "co2");
    const avoided = v.repairs.handprint.find((h) => h.key === "rep_avoided_co2");
    return {
      title: "Emissions",
      focus: { section: "comparison" },
      sentences: [
        S(`Emissions from washing and delivery were an estimated ${r.saving.display} lower than with ${base(v)} (${r.pct.display}); the plausible range is ${r.low.display} to ${r.high.display}.`, r.saving, r.pct, r.low, r.high),
        ...(avoided ? [S(`Repairs added an estimated ${avoided.base.display} of avoided product emissions on top (assumption: one repair postpones one replacement).`, avoided.base)] : []),
      ],
    };
  },
  energy(c: Ctx): Draft {
    const { v } = c;
    const r = rowOf(v, "energy");
    return {
      title: "Energy",
      focus: { section: "comparison" },
      sentences: [S(`Process energy was an estimated ${r.saving.display} lower than with ${base(v)} (${r.pct.display}); the plausible range is ${r.low.display} to ${r.high.display}.`, r.saving, r.pct, r.low, r.high)],
    };
  },
  savings(c: Ctx): Draft {
    const { v } = c;
    return {
      title: `Saving compared with ${base(v)}`,
      focus: { section: "comparison" },
      sentences: [
        S(`Compared with ${base(v)}, the estimated saving is ${join(v.comparison.rows.map((r) => `${r.saving.display} of ${lc(r.label).split(" (")[0]} (${r.pct.display})`))}.`, ...v.comparison.rows.flatMap((r) => [r.saving, r.pct])),
        S(`The result depends on the baseline: for water the saving is ${join(v.comparison.byBaseline.map((b) => `${b.waterPct.display} against ${lc(b.label)}`))}.`, ...v.comparison.byBaseline.map((b) => b.waterPct)),
      ],
    };
  },
  service(c: Ctx): Draft {
    const { v } = c;
    const by = (k: string) => ranked(v, METRICS.find((m) => m.key === k)!, "worst").rows[0]!;
    const late = by("on_time_pct");
    const req = by("req_per_1k");
    const short = shortName(v);
    return {
      title: "Service performance",
      focus: { section: "sites" },
      sentences: [
        S(`${cm(v, "on_time_pct").display} of cycles were delivered on time, with ${cm(v, "req_per_1k").display} service requests per 1 000 wearers and an average cycle of ${cm(v, "avg_cycle_h").display}.`, cm(v, "on_time_pct"), cm(v, "req_per_1k"), cm(v, "avg_cycle_h")),
        S(`${short(late.site)} is lowest on delivery at ${late.cell.display}; ${short(req.site)} has the most service requests at ${req.cell.display} per 1 000 wearers.`, late.cell, req.cell),
      ],
    };
  },
  siteRank(c: Ctx): Draft {
    const { v, text } = c;
    const m = metricOf(text);
    const { rows, end } = ranked(v, m, text);
    const top = rows.slice(0, 3);
    const short = shortName(v);
    const unit = (cell: Cell) => cell.display;
    return {
      title: `Sites by ${m.ofWhat}`,
      focus: { section: "sites", site: top[0]?.site.id },
      sentences: [
        S(`By ${m.noun}, the ${end} sites are ${join(top.map((r) => `${short(r.site)} (${unit(r.cell)})`))}, against ${cm(v, m.key)?.display ?? "n/a"} for all ${v.customer.siteCount} sites together.`, ...top.map((r) => r.cell), ...(cm(v, m.key) ? [cm(v, m.key)] : [])),
        ...(m.better === "none" ? [] : [S(`This ranks ${v.customer.siteCount} sites on one measure only; a site that is weakest on ${m.ofWhat} may be fine on the others.`)]),
      ],
      followUps: top.slice(0, 1).map((r) => `How is service at ${short(r.site)}?`),
    };
  },
  siteDetail(c: Ctx): Draft | null {
    const { v } = c;
    const site = c.sites[0];
    if (!site) return null;
    const m = site.m;
    const dRank = rankOfSite(v, site, METRICS[0]!);
    const out: Sentence[] = [
      S(`${m.on_time_pct!.display} of cycles were delivered on time (${cm(v, "on_time_pct").display} across all sites), with ${m.req_per_1k!.display} service requests per 1 000 wearers (${cm(v, "req_per_1k").display} across all sites) and an average cycle of ${m.avg_cycle_h!.display}.`, m.on_time_pct!, cm(v, "on_time_pct"), m.req_per_1k!, cm(v, "req_per_1k"), m.avg_cycle_h!),
      S(`${m.util_pct!.display} of the garments are in active use; ${m.excess_pieces!.display} are above the site's average need, which ties up about ${m.unused_cost!.display} in unscanned stock.`, m.util_pct!, m.excess_pieces!, m.unused_cost!),
      S(`The laundry water allocated to the site is ${m.water_per_kg!.display}; the estimated water saving compared with ${base(v)} is ${m.sav_water_pct!.display}.`, m.water_per_kg!, m.sav_water_pct!),
    ];
    if (dRank) out.push(S(`On delivery it ranks ${ord(dRank)} of ${v.customer.siteCount} sites.`));
    return { title: site.name, focus: { section: "sites", site: site.id }, sentences: out, followUps: [`Compare ${shortName(v)(site)} with the other sites`, "Which site is slowest on delivery?"] };
  },
  siteCompare(c: Ctx): Draft | null {
    const { v } = c;
    const [a, b] = c.sites;
    if (!a) return null;
    const short = shortName(v);
    const keys: [string, string][] = [["on_time_pct", "delivered on time"], ["req_per_1k", "service requests per 1 000 wearers"], ["avg_cycle_h", "average cycle"], ["util_pct", "garments in use"], ["water_per_kg", "water per washed kg"]];
    const sentences = keys.flatMap(([k, what]) => {
      const x = a.m[k];
      const y = b ? b.m[k] : cm(v, k);
      if (!x || !y) return [];
      return [S(`${cap(what)}: ${short(a)} ${x.display}, ${b ? short(b) : "all sites together"} ${y.display}.`, x, y)];
    });
    return { title: b ? `${short(a)} and ${short(b)}` : `${short(a)} against all sites`, focus: { section: "sites", site: a.id }, sentences };
  },
  utilisation(c: Ctx): Draft {
    const { v } = c;
    const top = ranked(v, METRICS.find((m) => m.key === "excess_pieces")!, "most").rows.slice(0, 3);
    const short = shortName(v);
    return {
      title: "Garments in use",
      focus: { section: "sites" },
      sentences: [
        S(`${cm(v, "util_pct").display} of the ${cm(v, "alloc").display} allocated garments were scanned in active use; ${cm(v, "excess_pieces").display} garments sit above the sites' average need.`, cm(v, "util_pct"), cm(v, "alloc"), cm(v, "excess_pieces")),
        S(`The unscanned stock ties up an estimated ${cm(v, "unused_cost").display} (synthetic purchase cost), with the most surplus at ${join(top.map((r) => `${short(r.site)} (${r.cell.display})`))}.`, cm(v, "unused_cost"), ...top.map((r) => r.cell)),
      ],
    };
  },
  repair(c: Ctx): Draft {
    const { v } = c;
    const t = v.repairs.byType[0];
    const hp = v.repairs.handprint;
    const get = (k: string) => hp.find((h) => h.key === k);
    return {
      title: "Repairs",
      focus: { section: "repairs" },
      sentences: [
        S(`${cm(v, "rep").display} repairs were completed, ${cm(v, "rep_per_100").display} per 100 wearers.`, cm(v, "rep"), cm(v, "rep_per_100")),
        ...(t ? [S(`The most common repair type is ${lc(t.label)} (${t.cell.display}, ${t.share.display} of repairs).`, t.cell, t.share)] : []),
        ...(get("rep_avoided_co2") && get("rep_avoided_eur") ? [S(`If each repair postponed one replacement (an assumption), that avoided an estimated ${get("rep_avoided_co2")!.base.display} of product emissions and ${get("rep_avoided_eur")!.base.display} in purchase cost.`, get("rep_avoided_co2")!.base, get("rep_avoided_eur")!.base)] : []),
      ],
    };
  },
  circularity(c: Ctx): Draft {
    const { v } = c;
    const r = v.circularity.routes;
    return {
      title: "Textile waste and circularity",
      focus: { section: "repairs" },
      sentences: [
        S(`${v.circularity.total.display} of textile waste arose, and ${v.circularity.diverted.display} was kept out of incineration.`, v.circularity.total, v.circularity.diverted),
        S(`By route: ${join(r.map((x) => `${lc(x.label)} ${x.cell.display}`))}.`, ...r.map((x) => x.cell)),
      ],
    };
  },
  recommend(c: Ctx): Draft {
    const top = c.v.observations.slice(0, 3);
    return {
      title: "What to do next",
      focus: { section: "observations" },
      sentences: top.map((o) => S(`${o.action.title} (${o.action.effort} effort).`, ...o.evidence.slice(0, 1).map((e) => e.cell))),
    };
  },
  discuss(c: Ctx): Draft {
    return { title: "Points for the meeting", focus: { section: "observations" }, sentences: c.v.discussion.map((d) => ({ text: d, cells: [], kind: "question" as const })) };
  },
  reliability(c: Ctx): Draft {
    const { v } = c;
    const by: Record<string, number> = {};
    for (const k of v.kpis) by[k.cell.status] = (by[k.cell.status] ?? 0) + 1;
    const limits = v.gaps.filter((g) => g.severity !== "info").slice(0, 3);
    return {
      title: "How reliable the figures are",
      focus: { section: "method" },
      sentences: [
        S(`Of the ${v.kpis.length} headline figures, ${join(Object.entries(by).map(([s, n]) => `${n} ${s}`))}. All input data is synthetic, and estimates carry a ±20 % band.`),
        ...limits.map((g) => ({ text: g.text, cells: [], kind: "note" as const })),
      ],
    };
  },
  method(c: Ctx): Draft {
    const { v } = c;
    return {
      title: "How the figures are calculated",
      focus: { section: "method" },
      sentences: [
        S("Every figure traces back to a cell in the supplied spreadsheet: source cell, then measure formula, then site and month, then year. Click any figure to open its formula and inputs.", ),
        S(`Savings compare the actual per-kg figures with ${base(v)}; the low and high values are ±20 % around that baseline, which is a prototype assumption. Water, energy and emissions are allocated from the laundries by washed-kg share.`),
      ],
    };
  },
  tailor(c: Ctx): Draft {
    const { v, interp } = c;
    const by: Record<string, (c: Ctx) => Draft> = { water: run.water, emissions: run.emissions, cost: run.utilisation, circularity: run.circularity, service: run.service, overview: run.value };
    const d = by[interp.priority]!(c);
    return { ...d, title: `Focus: ${d.title}` };
  },
  scope(c: Ctx): Draft {
    const { v } = c;
    return {
      title: "What this review covers",
      focus: { section: "overview" },
      sentences: [
        S(`${v.customer.name} (${lc(v.customer.industry)}): ${v.customer.siteCount} sites in ${join(v.customer.countries)}, served from ${v.customer.laundries.length} laundr${v.customer.laundries.length === 1 ? "y" : "ies"}. The period shown is ${lc(v.periodLabel)}, compared with ${base(v)}.`),
        S("All data comes from the supplied synthetic spreadsheet pack."),
      ],
    };
  },
};

const NO_EXAMPLES: Record<string, string[]> = {
  why: ["Why did emissions go down?", "What caused the late deliveries?", "What is the reason for the surplus?", "What is behind these results?", "What drove the improvement?", "Explain why this happened"],
  change: ["Did the lateness problem get fixed?", "Has delivery improved since last year?", "Are things getting better over time?", "Is the trend going up or down?", "How does this compare with last year?", "Did emissions fall compared with 2024?"],
  price: ["How much does this cost us in euros per year?", "Is the contract worth it financially?", "What did we pay per month?", "How much does the service cost?", "Show me the invoices", "What is the contract price?", "Are we being overcharged?", "What is the cost per kilo?"],
  benchmark: ["How do we compare with other customers?", "Are we better than similar companies?", "What is the industry average?", "Where do we rank among peers?"],
  forecast: ["What will water use be next year?", "Predict next year's emissions", "What is expected next quarter?", "Can you forecast demand?"],
  compliance: ["Is this CSRD audit ready?", "Can we use this in our ESG report?", "Is the data certified?", "Do you have material traceability?", "Will an auditor accept these numbers?"],
  orders: ["Where is my order?", "Track my delivery", "What is the shipment status?", "When will my garments arrive?"],
  other: ["Who is my account manager?", "What is the phone number?", "I have a complaint about quality", "Send me the logo"],
};

/** Narrower than narrate.ts's patterns, which only see questions the model was about to answer: "paying for garments nobody wears" is not about price. */
const NO_KW: Record<string, RegExp> = {
  forecast: /\b(forecast\w*|predict\w*|projection\w*|project the|will we|going to be|expected next|in the future|going forward|next (year|quarter|month|season)|20(2[6-9]|3\d))\b/i,
  benchmark: /\b(benchmark\w*|other customers|peers|rivals?|competitors?|quartile|industry average|similar (companies|customers)|compared (to|with) (other|similar)|better than (others|average))\b/i,
  change: /\b(did|have|has)\b.{0,30}\b(go (up|down)|fall|fell|drop(ped)?|rise|rose|increase[d]?|decrease[d]?|improve[d]?|fix(ed)?|chang(e|ed)|better|worse)\b|\b(last year|previous year|year[- ]on[- ]year|a year ago|since last|over time|trend|in 20(2[0-4])|make a difference)\b|\bbetter than (last|a year)/i,
  other: /\b(phone|e-?mail|contact (details|info|support)|logo|complain\w* about|account manager'?s? (e-?mail|phone|number)|who is my account manager|support (number|line)|contact support)\b/i,
  orders: /\b(orders?|ordering|tracking|track (my|the)|where is my|shipments?|parcels?|status of my|delivery status)\b/i,
  price: /\b(charg\w*|tariffs?|rate card|prices?|invoices?|billing|quotes?|contracts?|payments?|what did we pay|how much (do|did|does) (we|it) (pay|cost)|cost us|costs? (us|per (month|year))|per month|fees?|subscription|euros? per)\b/i,
};

const INTENTS: Intent[] = [
  {
    id: "value", label: "Overall value", kw: /\b(overall|summar\w*|overview|value|year in|highlights?|headline|big picture|key (figures|numbers|results))\b/i,
    examples: ["Walk me through what this report says", "What are we getting for our money?", "How did the customer do in 2025?", "What impact did the service have for us?", "Give me the gist", "Anything I should know before the meeting?", "What did we actually get out of this?", "Sum up the year", "What is the main takeaway?", "So how did it go?", "What value did we get this year?", "Give me a summary of the year", "How are we doing overall?", "What are the key results?", "Show the headline numbers", "Give me the big picture", "What does this review say in short?", "Tell me about our performance"],
    follow: ["What should we do next?", "How much water did we save?", "Which site needs attention?"],
    run: run.value,
  },
  {
    id: "water", label: "Water", kw: /\b(water|litre\w*|liter\w*|m3|m³|wash(ing)? water|h2o)\b/i, kwWeight: 1,
    examples: ["How much water did we save?", "What is our water consumption?", "Are we using less fresh water than before?", "How many litres per kilo of laundry?", "Tell me about water efficiency", "How much fresh water does the service save?", "Water use of the laundry"],
    follow: ["How does this compare with home washing?", "What about emissions?", "Which site uses the most water?"],
    run: run.water,
  },
  {
    id: "emissions", label: "Emissions", kw: /\b(emission\w*|co2e?|carbon|climate|greenhouse|ghg|footprint|handprint|scope ?[123])\b/i, kwWeight: 1,
    examples: ["How green is the service?", "How much CO2 did we avoid?", "What is our carbon footprint?", "How much have emissions fallen?", "Climate impact of the service", "Greenhouse gas savings", "What is the handprint?", "Tell me about our carbon savings"],
    follow: ["How much water did we save?", "How much energy did we save?", "How reliable are these estimates?"],
    run: run.emissions,
  },
  {
    id: "energy", label: "Energy", kw: /\\b(kilowatt\w*)\\b|\b(energy|electricity|kwh|mwh|power|heat\w*|gas)\b/i, kwWeight: 1,
    examples: ["Kilowatt hours saved", "Power consumption of the process", "How much energy did we save?", "What is the electricity use of washing?", "Process energy compared with the alternative", "Did the service cut energy consumption?"],
    follow: ["What about emissions?", "How much water did we save?"],
    run: run.energy,
  },
  {
    id: "savings", label: "Savings against an alternative", kw: /\b(compar\w*|versus|vs\.?|against|alternative|baseline|home wash\w*|in[- ]house|own laundry|local laundry|outsourc\w*)\b/i, kwWeight: 0.9,
    examples: ["How do we compare with washing at home?", "Compare our circular service with local laundry", "What would it have been with an in-house laundry?", "How much better is this than the alternative?", "What are we comparing against?", "Savings versus doing the laundry ourselves", "How does the baseline change the result?"],
    follow: ["How reliable are these estimates?", "How are the figures calculated?", "What about emissions?"],
    run: run.savings,
  },
  {
    id: "service", label: "Service performance", kw: /\b(service|deliver\w*|on[- ]?time|late\w*|punctual\w*|reliab\w*|turnaround|cycle time|service requests?|complain\w*)\b/i, kwWeight: 0.8,
    examples: ["How many support tickets are raised?", "Do items arrive when promised?", "Is turnaround speed a problem?", "Is there a problem with lateness?", "Are cycles finishing late?", "Any delivery problems?", "How is the service performing?", "Are deliveries on time?", "How reliable is the laundry service?", "Are there many service requests?", "What is the turnaround time?", "Is anything late?", "How good is delivery performance?", "Are customers complaining?"],
    follow: ["Which site is slowest on delivery?", "Which site has the most service requests?", "What should we discuss with the service team?"],
    run: run.service,
  },
  {
    id: "site-rank", label: "Best and worst sites", kwWeight: 2, kw: /\\b(rank\\w*|top (three|3|five|5|ten|10)|best site|worst site|longest|shortest)\\b|\b(which|what) (site|location|plant|unit|branch)s?\b|\b(worst|best|weakest|strongest|lowest|highest|most|least)\b.{0,40}\b(site|sites|location|locations)\b|\b(site|sites|location|locations)\b.{0,40}\b(worst|best|weakest|strongest|lowest|highest|most|least|behind|struggl\w*|problem\w*)\b/i, 
    examples: ["Best site for on-time deliveries", "Where is the cycle time longest?", "Which of our locations lags on delivery?", "Top three sites with spare garments", "Rank the sites by delivery", "Which site has the most idle garments?", "Order the sites from best to worst", "Where should we look first?", "Which site is the worst on delivery?", "Which locations need attention?", "Where is the problem biggest?", "Which site is doing best?", "Rank the sites", "Which sites have the most surplus garments?", "Who is lagging behind?", "Which site uses the most water?", "Where are we weakest?", "Which site has the fewest service requests?"],
    follow: ["How is service at the weakest site?", "What should we do about it?"],
    run: run.siteRank,
  },
  {
    id: "site-detail", label: "A single site", kw: /(?!)/, // needs a site name; found by entity
    examples: ["How is service at Helsinki?", "Tell me about the Turku site", "Show me the figures for Oulu", "What is happening in Tampere?", "How is this location doing?", "Details for one site"],
    follow: ["Which site is slowest on delivery?"],
    run: (c) => run.siteDetail(c) ?? { title: "", sentences: [] },
  },
  {
    id: "site-compare", label: "Compare sites", kw: /\\b(trail\\w*|lag\\w*|behind the (other|rest))\\b|\b(compar\w*|versus|vs\.?|worse|better|than|against|relative to)\b/i, kwWeight: 0.3,
    examples: ["Does this site trail the other sites?", "Is this site behind the rest?", "Is Pori worse than the others?", "Compare Helsinki and Turku", "How does Oulu compare with the rest?", "Is this site better than average?", "Helsinki versus Tampere"],
    follow: ["Which site is worst on delivery?"],
    run: (c) => run.siteCompare(c) ?? { title: "", sentences: [] },
  },
  {
    id: "utilisation", label: "Garments in use", kw: /\b(in use|being used|worn|wearing)\b|\b(utili[sz]\w*|surplus|excess\w*|over-?alloc\w*|allocation|in circulation|unused|not (being )?used|idle|too many garments|stock)\b/i, kwWeight: 0.9,
    examples: ["Are we paying for garments nobody wears?", "Do some sites hold more clothes than they need?", "Is stock being wasted?", "Are our garments being used?", "Do we have too many garments?", "How much stock is sitting idle?", "How much capital is tied up in unused clothing?", "Can we reduce our allocation?", "Where could we cut the number of garments?", "How many garments are scanned?", "Are we over-allocated?"],
    follow: ["Which sites have the most surplus garments?", "What should we do next?"],
    run: run.utilisation,
  },
  {
    id: "repair", label: "Repairs", kw: /\b(repair\w*|mend\w*|patch\w*|zipper\w*|button\w*|torn|damag\w*|lifetime|extend\w*)\b/i, kwWeight: 1,
    examples: ["How many repairs were done?", "What gets repaired most often?", "How much did repairs save?", "Do repairs extend garment life?", "Tell me about repair activity", "What do repairs avoid in purchases?"],
    follow: ["What about textile waste?", "What about emissions?"],
    run: run.repair,
  },
  {
    id: "circularity", label: "Textile waste", kw: /\b(waste|recycl\w*|reus\w*|circular\w*|incinerat\w*|landfill|divert\w*|end of life|discard\w*)\b/i, kwWeight: 1,
    examples: ["How much textile waste is there?", "What happens to worn-out garments?", "How much is recycled?", "How circular is the service?", "How much is reused?", "Is any waste burned?"],
    follow: ["How many repairs were done?"],
    run: run.circularity,
  },
  {
    id: "recommend", label: "Recommendations", kw: /\\b(quick wins?|money on the table|low[- ]hanging|act on|what would you do)\\b|\b(recommend\w*|should we|what (can|should|could) we|next steps?|improv\w*|action\w*|suggest\w*|advice|opportunit\w*|priorit\w*)\b/i, kwWeight: 1,
    examples: ["What would you do in our place?", "Give me three things to act on", "Where is the money on the table?", "Quick wins?", "What should we do next?", "How can we improve?", "What do you recommend?", "Where is the biggest opportunity?", "Suggest some actions", "What are the next steps?", "What should we focus on?", "How can we get more out of the service?"],
    follow: ["What should we discuss in the meeting?", "Which site needs attention?"],
    run: run.recommend,
  },
  {
    id: "discuss", label: "Discussion points", kw: /\b(discuss\w*|agenda|talking points?|steering|meeting|questions to ask|bring up|raise)\b/i, kwWeight: 1,
    examples: ["What questions should I ask my account team?", "What should I raise with Lindström?", "Meeting preparation", "Prepare discussion points for the steering committee", "What should we talk about in the review meeting?", "Give me an agenda", "What questions should we ask?", "What should we bring up with Lindström?"],
    follow: ["What do you recommend?"],
    run: run.discuss,
  },
  {
    id: "reliability", label: "How reliable", kw: /\\b(guess\w*|double[- ]check|made up|missing data|uncertain\w*|solid)\\b|\b(reliab\w* (is|are|the)|trust\w*|confiden\w*|accura\w*|certain|uncertain\w*|estimate[sd]?|synthetic|assumption\w*|limitation\w*|caveat\w*|data quality|how sure|credible|gaps?)\b/i, kwWeight: 0.9,
    examples: ["How much of this is guesswork?", "Should I double-check any of these figures?", "What can you not tell me because of missing data?", "How solid is this data?", "What are the weak spots?", "Is this real data or made up?", "Which parts of this are uncertain?", "How reliable are these figures?", "Can we trust these numbers?", "How accurate are the estimates?", "What are the limitations?", "What is missing from the data?", "How sure are you?", "Which numbers are estimated?", "What assumptions are behind this?"],
    follow: ["How are the figures calculated?"],
    run: run.reliability,
  },
  {
    id: "method", label: "Method", kwWeight: 2, kw: /\\b(logic behind|worked? out|work out|get from)\\b|\b(how (is|are|was|were|do|did) .{0,30}(calculat\w*|comput\w*|work\w*|derive\w*|measure\w*)|calculat\w*|formula\w*|method\w*|where (does|do) .{0,20}come from|trace\w*|source\w*|provenance)\b/i, 
    examples: ["How do you get from the spreadsheet to this number?", "What is the logic behind the allocation?", "How is the allocation to our company done?", "What formula is behind this number?", "How was the water saving worked out?", "Show me the workings", "How are the figures calculated?", "Where do these numbers come from?", "Explain the method", "Show me the formula", "How do you know this?", "Can I trace a number back to the data?"],
    follow: ["How reliable are these figures?"],
    run: run.method,
  },
  {
    id: "scope", label: "What this covers", kw: /\\b(countries|country|which sites)\\b|\b(what (is|does) this|about this review|who is|which customer|period|scope|cover\w*|how many sites|which countries)\b/i, kwWeight: 0.7,
    examples: ["Which year is this?", "What is this report about?", "Which sites and countries does this include?", "What is in scope?", "What does this review cover?", "Which customer is this for?", "How many sites are included?", "Which countries are involved?", "What period does the data span?"],
    follow: ["Give me a summary of the year"],
    run: run.scope,
  },
  {
    id: "tailor", label: "Change the focus", kw: /\\b(let'?s (focus|concentrate)|concentrate)\\b|\b(focus on|concentrate on|switch to|tailor\w*|prioriti[sz]e|emphasi[sz]e|put .{0,15} first)\b/i, kwWeight: 1.4,
    examples: ["Show me this from a sustainability angle", "Let's concentrate on cost and allocation", "Look at it from a service perspective", "Focus on water and emissions", "Show me the service performance view", "Switch to the cost view", "Tailor this review to sustainability", "Prioritise circularity", "Put emissions first", "Focus on the food-industry sites"],
    follow: ["Give me a summary of the year"],
    run: run.tailor,
  },
  {
    id: "offtopic", label: "Off topic", kw: /(?!)/,
    examples: ["Recommend a good book", "What is the population of Japan?", "Translate this into French", "Suggest a holiday destination", "Solve this equation", "What is the weather tomorrow?", "Tell me a joke", "How do I bake bread?", "Who won the football match?", "What is the capital of France?", "Write me a poem", "What time is it?", "Recommend a restaurant", "How do I fix my computer?", "banana", "hello", "who are you", "what is the news today"],
    follow: [],
  },
  // Things the data cannot answer. Matching them is a feature: the honest answer is "no", and which module would cover it.
  ...NO_DATA.map<Intent>((n) => ({
    id: `no:${n.id}`, label: "Not in the data", kw: NO_KW[n.id] ?? n.re, kwWeight: 3, noData: n.id,
    examples: NO_EXAMPLES[n.id] ?? [],
    follow: ["Give me a summary of the year", "What should we do next?"],
  })),
];

// ------------------------------------------------------------------------------ matching

/** What the browser embeds once: every example phrasing with its intent id. */
export function intentTexts(): { id: string; text: string }[] {
  return INTENTS.flatMap((i) => i.examples.map((text) => ({ id: i.id, text })));
}

/** Thresholds, measured with scripts/answer-eval.ts. */
export const THRESHOLDS = { high: 0.62, medium: 0.5, margin: 0.04 };

interface Scored { intent: Intent; score: number; sim: number; kw: number }

function score(text: string, sims: Record<string, number> | undefined, sites: SiteRow[]): Scored[] {
  return INTENTS.map((intent) => {
    let kw = 0;
    const hits = text.match(new RegExp(intent.kw.source, "gi"))?.length ?? 0;
    if (hits) kw = Math.min(hits, 2) === 2 ? 1.25 : 1;
    const sim = sims?.[intent.id] ?? 0;
    // Site questions have no keywords of their own: a site name plus no better topic means "tell me about that site".
    let bonus = 0;
    if (intent.id === "site-detail" && sites.length === 1) bonus = 0.18;
    if (intent.id === "site-compare" && sites.length >= 2) bonus = 0.3;
    if (intent.id === "site-compare" && sites.length === 1 && /\b(rest|others?|average|all sites|other sites|everyone)\b/i.test(text)) bonus = 0.2;
    if (intent.id === "site-rank" && sites.length > 0) bonus = -0.15;
    const w = intent.kwWeight ?? 0.8;
    // With embeddings: meaning leads and words add to it. Without: words alone, capped so they read as "medium".
    let s: number;
    if (sims) s = sim + 0.12 * w * kw + bonus;
    else {
      s = 0.5 * w * kw + bonus;
      if (intent.id === "site-detail" && sites.length === 1) s += 0.35;
      if (intent.id === "site-compare" && bonus > 0) s += 0.45;
    }
    return { intent, score: s, sim, kw };
  }).sort((a, b) => b.score - a.score);
}

/** Questions that always work, offered when nothing was understood. */
const STARTERS = ["Give me a summary of the year", "Which site is worst on delivery?", "What should we do next?"];

function exampleFor(i: Intent): string {
  return i.examples[0] ?? i.label;
}

// -------------------------------------------------------------------------------- answering

/**
 * Answers a question from the view. `sims` is the best cosine similarity per intent id from the
 * browser's embedding model, or undefined when that model is not available.
 */
export function answerQuestion(view: CustomerView, text: string, interp: Interpretation, sims?: Record<string, number>, force?: string): Answer {
  const q = text.slice(0, 300);
  const sites = sitesIn(q, view.sites);
  const ctx: Ctx = { v: view, text: q, sites, interp };
  const scored = score(q, sims, sites);
  const [top, second] = scored;
  const read = {
    via: sims ? ("meaning and keywords" as const) : ("keywords" as const),
    matched: interp.matched,
    candidates: scored.slice(0, 3).map((s) => ({ intent: s.intent.id, label: s.intent.label, score: +s.score.toFixed(2) })),
  };
  const thr = sims ? THRESHOLDS : { high: 0.62, medium: 0.4, margin: 0.0 };
  // The reader picked a reading themselves ("not what you meant?"): take it.
  const forced = force ? scored.find((x) => x.intent.id === force && x.intent.id !== "offtopic") : undefined;
  const confident = !!forced || (top!.score >= thr.medium && top!.score - (second?.score ?? 0) >= thr.margin * 0.5);

  const clarify = (title: string, intro: string, extra: string[] = []): Answer => ({
    intent: "clarify", label: "Not sure", confidence: "low", type: "clarify", title,
    sentences: [{ text: intro, cells: [], kind: "note" }],
    followUps: [...extra, ...(top!.intent.id === "offtopic" ? [] : scored).filter((s) => !s.intent.noData && s.intent.id !== "offtopic" && s.intent.id !== "tailor").slice(0, 3).map((s) => exampleFor(s.intent)), ...STARTERS].filter((x, i, a) => a.indexOf(x) === i).slice(0, 4),
    read,
  });

  if (forced) scored.unshift(scored.splice(scored.indexOf(forced), 1)[0]!);
  if (top!.intent.id === "offtopic" && !forced) return clarify("That is outside this review", "I can only answer questions about this customer's laundry service review. These I can answer:");
  if (!confident) return clarify("I am not sure what you are asking", "I could not match that to something this review covers. These are the closest questions I can answer:");

  const i = scored[0]!.intent;
  const confidence: Answer["confidence"] = forced ? "high" : top!.score >= thr.high && top!.score - (second?.score ?? 0) >= thr.margin ? "high" : "medium";

  if (i.noData) {
    const n = NO_DATA.find((x) => x.id === i.noData)!;
    return {
      intent: i.id, label: i.label, confidence, type: "no-data", title: "This review cannot answer that",
      sentences: [{ text: n.reason, cells: [], kind: "note" }], noData: { reason: n.reason, module: n.module },
      followUps: i.follow, read,
    };
  }

  const d = i.run!(ctx) as Draft | null;
  if (!d || !d.sentences.length) {
    // A site question with no recognisable site, or a comparison with nothing to compare.
    const short = shortName(view);
    const weakest = ranked(view, METRICS[0]!, "worst").rows.slice(0, 3);
    return clarify("Which site do you mean?", "I could not find a site name in the question. Pick one, or ask about all sites:", weakest.map((r) => `How is service at ${short(r.site)}?`));
  }
  const follow = [...(d.followUps ?? []), ...i.follow].filter((x, idx, a) => a.indexOf(x) === idx).slice(0, 3);
  const apply = i.id === "tailor" ? { ...(interp.priority !== "overview" ? { priority: interp.priority } : {}), ...(interp.baseline ? { baseline: interp.baseline } : {}), ...(interp.period ? { period: interp.period } : {}) } : undefined;
  return { intent: i.id, label: i.label, confidence, type: "answer", title: d.title, sentences: d.sentences, focus: d.focus, followUps: follow, read, ...(apply && Object.keys(apply).length ? { apply } : {}) };
}
