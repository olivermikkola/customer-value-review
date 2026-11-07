/**
 * The language-model layer for the review, in English.
 *
 * The model never computes. For each observation it is handed a short list of finished figures
 * (the observation's own evidence) and may only restate them in plain words. Everything it writes
 * goes through `gateText` before the page shows it: every figure must be one it was given, an
 * estimate must be called an estimate, and causal claims or overclaims are refused. Anything the
 * model gets wrong twice is replaced by the rules-written sentence, so the review is never empty.
 *
 * The browser runs the model; this file runs the gate and rebuilds the task from the same view, so
 * the client cannot widen what the model is allowed to say.
 */
import type { Cell, CustomerView, Interpretation, Observation } from "./view.ts";

export interface Fact {
  id: string;
  label: string;
  display: string;
  status: string;
  measureId: string;
  /** What exactly the figure measures, when the label alone could be misread. */
  note?: string;
}

export interface Task {
  id: string;
  kind: "summary" | "observation" | "answer";
  title: string;
  system: string;
  user: string;
  maxSentences: number;
  /** Written by rules from the same facts. Shown, marked as such, when the model fails twice. */
  fallbacks: string[];
  facts: Fact[];
  /** Site names the model may mention (those that appear in its facts or the written context). */
  siteNames: string[];
  /** Rules-written text shown to the model besides the facts (e.g. the meeting question). Numbers in it are allowed. */
  context: string;
}

export type PublicTask = Omit<Task, "facts" | "siteNames" | "context">;

export const SYSTEM = [
  "You help a key account manager write a customer review for a textile-service customer.",
  "Write for a busy decision-maker: plain words, short sentences, no jargon, no sustainability expertise needed.",
  "Output only the sentences, one per line.",
  "HARD RULES:",
  "1. Use only the figures listed under FACTS. Copy each exactly as written, with its unit. Never calculate, round, convert, compare or combine figures, and never write any other number.",
  "2. A figure described as an estimate must be called one in your sentence, for example 'an estimated ...' or 'about ...'.",
  "3. Do not explain causes: no 'because', 'due to', 'caused by', 'thanks to', 'as a result'.",
  "4. No superlatives or promises: best, record, guarantee, proven, significant, dramatic, huge.",
  "5. Do not mention sites, figures or data that are not listed.",
  "6. Write natural sentences in your own words. Do not copy the layout of the facts, and do not repeat the text after the dashes word for word.",
].join("\n");

// No brackets or parentheses here: a small model copies whatever punctuation it is shown.
const factLine = (f: Fact) => `- ${f.label}: ${f.display}${f.note ? ` — ${f.note}` : ""}${f.status === "estimated" ? " — this is an estimate" : f.status === "allocated" ? " — this is an allocated estimate" : ""}`;

function factsOf(items: { label: string; cell: Cell; note?: string }[]): Fact[] {
  const seen = new Set<string>();
  const out: Fact[] = [];
  for (const { label, cell, note } of items) {
    if (seen.has(cell.id)) continue;
    seen.add(cell.id);
    out.push({ id: `F${out.length + 1}`, label, display: cell.display, status: cell.status, measureId: cell.id, note });
  }
  return out;
}

function siteNamesIn(view: CustomerView, facts: Fact[], context: string): string[] {
  const text = `${facts.map((f) => f.label).join(" ")} ${context}`;
  return view.sites.filter((s) => text.includes(s.name)).map((s) => s.name);
}

function build(view: CustomerView, base: Omit<Task, "system" | "user" | "siteNames" | "context"> & { instruction: string; question?: string; context?: string }): Task {
  const { instruction, question, context = "", ...rest } = base;
  const user = [
    ...(question ? [`Question: ${question}`] : []),
    `Customer: ${view.customer.name} (${view.customer.industry}). Period: ${view.periodLabel}. Compared with: ${view.baselineLabel}, ${view.params.scenario} case.`,
    "FACTS:",
    ...rest.facts.map(factLine),
    "",
    instruction,
  ].join("\n");
  return { ...rest, system: SYSTEM, user, siteNames: siteNamesIn(view, rest.facts, context), context };
}

export function summaryTask(view: CustomerView): Task {
  const facts = factsOf(view.kpis.slice(0, 4).map((k) => ({ label: k.label, cell: k.cell, note: k.sub })));
  return build(view, {
    context: facts.map((f) => f.note ?? "").join(" "),
    id: "summary",
    kind: "summary",
    title: "The year in two sentences",
    maxSentences: 2,
    facts,
    fallbacks: [`${view.periodLabel}: ${facts.slice(0, 3).map((f) => `${f.label.toLowerCase()} ${f.display}`).join("; ")}.`],
    instruction: "Write exactly two complete sentences, no more. Each states one or two of the figures and says exactly what the figure measures, using its label and the note in brackets. Do not describe quality, speed or success unless a figure says so. Do not join two figures into one claim.",
  });
}

export function observationTask(view: CustomerView, o: Observation): Task {
  const facts = factsOf(o.evidence);
  return build(view, {
    id: o.id,
    kind: "observation",
    title: o.headline,
    maxSentences: 2,
    facts,
    fallbacks: [o.headline.replace(/\.?$/, ".")],
    context: `${o.discuss} ${o.action.title}`,
    instruction: `Topic: ${o.headline}\nQuestion for the meeting: ${o.discuss}\nSuggested action: ${o.action.title}\nWrite two sentences in plain words: first what the figures show, then what to discuss or do next, based on the question and action above. The second sentence needs no new figure.`,
  });
}

export function tasksFor(view: CustomerView, max = 4): Task[] {
  return [summaryTask(view), ...view.observations.slice(0, max).map((o) => observationTask(view, o))];
}

export function toPublic(t: Task): PublicTask {
  const { facts: _f, siteNames: _s, context: _c, ...rest } = t;
  return rest;
}

// ---------------------------------------------------------------------- answering questions

export interface Module {
  name: string;
  covers: string;
}
/** Lindström's own add-on modules, named as in their example dashboard. */
const MODULES = {
  transparency: { name: "Transparency & control", covers: "order and delivery status, return and wash-cycle tracking, proactive notifications" },
  benchmarking: { name: "Performance reporting & benchmarking", covers: "KPIs by site and role, industry benchmarks, ROI and efficiency measures" },
  predictive: { name: "Predictive & AI-assisted insights", covers: "demand forecasting, detection of unusual wear and loss, delivery forecasting" },
  compliance: { name: "Sustainability & compliance intelligence", covers: "ESG reporting, material traceability, audit-ready evidence" },
} satisfies Record<string, Module>;

const SITE_METRIC_LABEL: Record<string, string> = {
  util_pct: "garments in active use", on_time_pct: "cycles on time", req_per_1k: "service requests per 1 000 wearers", avg_cycle_h: "average cycle time",
  water_per_kg: "water per washed kg", sav_water_pct: "water saving vs. the alternative", sav_co2: "emissions saved vs. the alternative",
  rep_per_100: "repairs per 100 wearers", excess_pieces: "garments above average need", unused_cost: "capital in unscanned garments",
};

export const NO_DATA: { id: string; re: RegExp; reason: string; module?: Module }[] = [
  { id: "why", re: /\b(why|what caused|what is causing|reason for|root cause)\b/i, reason: "The data records what happened, not why. This review cannot give causes; the observations list questions to ask instead." },
  { id: "change", re: /\b(did|have|has)\b.{0,30}\b(go (up|down)|fall|fell|drop(ped)?|rise|rose|increase[d]?|decrease[d]?|improve[d]?|fix(ed)?|chang(e|ed)|better|worse)\b|\b(last year|previous year|year[- ]on[- ]year|since last|over time|trend)\b/i, reason: "This review covers 2025 only, so it cannot say whether something improved, changed or was fixed. The quarterly charts show the course through the year." },
  { id: "price", re: /\b(price|prices|invoice|invoices|billing|bill|quote|contract|pay|paying|payment|payments|paid)\b/i, reason: "This review has no prices, invoices or contract data, so it cannot answer that." },
  { id: "benchmark", re: /\b(benchmark|benchmarks|other customers|peers|industry average|compared (to|with) (other|similar)|better than (others|average))\b/i, reason: "There is no data on other customers in this review, so no comparison with them is possible.", module: MODULES.benchmarking },
  { id: "forecast", re: /\b(forecast|predict|prediction|projection|will we|going to be|expected next)\w*/i, reason: "This review looks back at the period; it contains no forecasts.", module: MODULES.predictive },
  { id: "compliance", re: /\b(esg|csrd|audit|audited|certif\w*|traceab\w*|origin of|recycled material)\b/i, reason: "This prototype is not audit-ready and holds no material traceability data.", module: MODULES.compliance },
  { id: "orders", re: /\b(order|orders|ordering|tracking|track my|where is|shipment|delivery status)\b/i, reason: "Orders and live delivery status are not part of this review.", module: MODULES.transparency },
  { id: "other", re: /\b(contact|phone|email|logo|complaint|complaints|quality of|account manager)\b/i, reason: "That is not something the data in this review covers." },
];

export type Routed = { noData: { reason: string; module?: Module } } | { task: Task };

export function routeQuestion(view: CustomerView, question: string, interp: Interpretation): Routed {
  const q = question.slice(0, 300);
  const hit = NO_DATA.find((r) => r.re.test(q));
  if (hit) return { noData: { reason: hit.reason, module: hit.module } };

  const obs = view.observations;
  const lead = obs[0];
  const site = interp.siteId ? view.sites.find((x) => x.id === interp.siteId) : undefined;
  const headline = (o: Observation) => o.headline.replace(/\.?$/, ".");
  const evidence = (o: Observation | undefined, n: number) => (o ? o.evidence.slice(0, n) : []);

  // A request for talking points or recommendations is answered from the observations' own questions and actions.
  if (/\b(discussion points?|talking points?|agenda|steering)\b/i.test(q)) {
    const top = obs.slice(0, 5);
    return {
      task: build(view, {
        id: "answer", kind: "answer", title: question, maxSentences: 5,
        facts: factsOf(top.flatMap((o) => evidence(o, 2))),
        fallbacks: view.discussion,
        question: q,
        context: top.map((o) => `${o.discuss} ${o.action.title}`).join(" "),
        instruction: `Turn these questions into up to five short discussion points for the steering committee, one sentence each. A point may cite one figure from the facts.\n${top.map((o, i) => `${i + 1}. ${o.discuss}`).join("\n")}`,
      }),
    };
  }
  if (/\b(improve|improvement|next year|should we|what (can|should) we|recommend\w*|next steps?|actions?)\b/i.test(q) && !site) {
    const top = obs.slice(0, 3);
    return {
      task: build(view, {
        id: "answer", kind: "answer", title: question, maxSentences: 3,
        facts: factsOf(top.flatMap((o) => evidence(o, 2))),
        fallbacks: top.map((o) => `${o.action.title}.`),
        question: q,
        context: top.map((o) => `${o.discuss} ${o.action.title}`).join(" "),
        instruction: `Answer with up to three recommendations, one sentence each, based on these suggested actions. A recommendation may cite one figure from the facts.\n${top.map((o, i) => `${i + 1}. ${o.action.title}`).join("\n")}`,
      }),
    };
  }

  const items: { label: string; cell: Cell }[] = [];
  let fallbacks: string[];
  // "Compare our service with local laundry": the comparison block is the answer, whatever else the words suggest.
  if (!site && /\b(compar\w*|versus|vs\.?|against)\b/i.test(q) && /\b(laundry|washing|in-house|local|home)\b/i.test(q)) {
    for (const r of view.comparison.rows) items.push({ label: `${r.label} saved compared with ${view.baselineLabel.toLowerCase()}`, cell: r.saving }, { label: `${r.label} saving as a share of the alternative`, cell: r.pct });
    return {
      task: build(view, {
        id: "answer", kind: "answer", title: question, maxSentences: 3, facts: factsOf(items), question: q,
        fallbacks: [`Compared with ${view.baselineLabel.toLowerCase()}, the service saved ${view.comparison.rows.map((r) => `${r.saving.display} of ${r.label.toLowerCase().split(" (")[0]}`).join(", ")} (estimates).`],
        instruction: "Answer in at most three sentences by stating what the service saved compared with the alternative, for water, energy and emissions. These are estimates and must be called so.",
      }),
    };
  }
  if (site) {
    for (const k of ["util_pct", "on_time_pct", "req_per_1k", "avg_cycle_h", "water_per_kg", "sav_water_pct", "sav_co2", "rep_per_100", "excess_pieces", "unused_cost"]) {
      const c = site.m[k];
      if (c) items.push({ label: `${site.name}, ${SITE_METRIC_LABEL[k] ?? k}`, cell: c });
    }
    // The customer-wide figure beside each, so "worse than the others?" can be answered.
    for (const k of ["on_time_pct", "util_pct", "req_per_1k", "avg_cycle_h"]) {
      const c = view.customerMetrics[k];
      if (c) items.push({ label: `All ${view.customer.siteCount} sites together, ${SITE_METRIC_LABEL[k] ?? k}`, cell: c });
    }
    const own = items.filter((i) => /on_time|util|req_per|cycle/.test(i.cell.id)).slice(0, 3);
    fallbacks = [`${site.name}: ${own.map((i) => `${i.label.split(", ")[1]} ${i.cell.display}`).join("; ")}.`];
  } else {
    items.push(...view.kpis.map((k) => ({ label: k.label, cell: k.cell })), ...evidence(lead, 6));
    fallbacks = lead ? [headline(lead)] : [];
  }
  const facts = factsOf(items).slice(0, 14);
  return {
    task: build(view, {
      id: "answer", kind: "answer", title: question, maxSentences: 3, facts, fallbacks, question: q,
      instruction: "Answer the question in at most three sentences, using only the facts that bear on it. For a general question, state the key figures. If the facts do not answer it, say so in one sentence and write no figure.",
    }),
  };
}

// ----------------------------------------------------------------------------- the gate

export type Code =
  | "EMPTY"
  | "NO_FIGURE"
  | "UNSOURCED_NUMBER"
  | "UNIT_MISMATCH"
  | "WORD_NUMBER"
  | "CAUSAL"
  | "OVERCLAIM"
  | "MISSING_HEDGE"
  | "COPIED_FORMAT"
  | "WRONG_SITE"
  | "TOO_LONG"
  | "TOO_MANY";

export interface Rejection {
  sentence: string;
  code: Code;
  detail: string;
}

export interface Accepted {
  text: string;
  /** Which of the task's facts this sentence states, so the UI can link each to its evidence. */
  facts: { label: string; display: string; measureId: string }[];
}

export interface Gated {
  accepted: Accepted[];
  rejected: Rejection[];
  /** Accepted sentences as text, to carry into a retry. */
  kept: string[];
  /** What to tell the model when something was refused; null when nothing was. */
  feedback: string | null;
}

const CAUSAL_RE = /\b(because|due to|(?:was|were|is|are|been) caused by|caused by|causing|as a result|thanks to|driven by|results? from|owing to|therefore|which is why)\b/i;
const OVERCLAIM_RE = /\b(best|record|guarantee[sd]?|proven?|proves?|prove[sd]|significant(ly)?|dramatic(ally)?|huge|massive|unprecedented|outstanding|world[- ]class|certified|verified|audited|always|never)\b/i;
const WORD_NUMBER_RE = /\b(half|double|doubled|twice|triple|tripled|tenfold|quarter of|third of|two-thirds)\b/i;
const HEDGE_RE = /\b(estimate[sd]?|estimated|about|around|roughly|approximately|approx\.?|assum\w+|illustrative|allocated|depends?|range)\b/i;
const MAX_WORDS = 45;

export function splitSentences(raw: string): string[] {
  return raw
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").replace(/\*\*/g, "").trim())
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-Z"“€])/))
    .map((l) => l.trim())
    .filter(Boolean);
}

const NUM_RE = /\d[\d,]*(?:\.\d+)?/g;
const norm = (s: string) => s.replace(/,/g, "");
const UNIT_CANON: Record<string, string> = { "%": "%", percent: "%", "per cent": "%", "m³": "m³", m3: "m³", "tco₂e": "tco2e", tco2e: "tco2e", mwh: "mwh", kwh: "kwh", kg: "kg", h: "h", t: "t" };
const UNIT_AFTER = /^\s?(%|percent|per cent|m³|m3|tCO₂e|tCO2e|MWh|kWh|kg|h|t)(?![A-Za-z])/i;

/** Figures a fact display contains, with the unit that follows each (if any). */
function figuresOf(display: string): { n: string; unit?: string }[] {
  return [...display.matchAll(NUM_RE)].map((m) => {
    const after = display.slice(m.index! + m[0].length);
    const u = UNIT_AFTER.exec(after)?.[1]?.toLowerCase();
    return { n: norm(m[0]), unit: u ? UNIT_CANON[u] : undefined };
  });
}

export function gateText(task: Task, view: CustomerView, raw: string, keep: string[] = []): Gated {
  const fresh = splitSentences(raw).filter((s) => !keep.includes(s));
  const sentences = [...keep, ...fresh];
  const allowed = task.facts.flatMap((f) => figuresOf(f.display).map((x) => ({ ...x, fact: f })));
  const joined = (t: string) => t.replace(/(\d) (\d{3})\b/g, "$1$2");
  const given = joined(`${task.context} ${task.facts.map((f) => `${f.label} ${f.note ?? ""}`).join(" ")}`);
  const context = new Set([String(view.customer.siteCount), "2025", ...[...given.matchAll(NUM_RE)].map((m) => norm(m[0]))]);
  const usesEstimate = (used: Fact[]) => used.some((f) => f.status === "estimated" || f.status === "allocated");

  const rejected: Rejection[] = [];
  const accepted: Accepted[] = [];
  const reject = (sentence: string, code: Code, detail: string) => rejected.push({ sentence, code, detail });

  if (sentences.length === 0) reject("", "EMPTY", "nothing was written");

  for (const s of sentences) {
    const stripped = s.replace(/\bQ[1-4]\b/g, " ").replace(/\b(19|20)\d{2}\b/g, " ");
    const words = s.split(/\s+/).length;
    let code: Code | null = null;
    let detail = "";
    const used: Fact[] = [];

    if (words > MAX_WORDS) [code, detail] = ["TOO_LONG", `${words} words, the limit is ${MAX_WORDS}`];
    else if (CAUSAL_RE.test(s)) [code, detail] = ["CAUSAL", `"${CAUSAL_RE.exec(s)![0]}" claims a cause this review does not establish`];
    else if (OVERCLAIM_RE.test(s)) [code, detail] = ["OVERCLAIM", `"${OVERCLAIM_RE.exec(s)![0]}" is not supported`];
    else if (WORD_NUMBER_RE.test(s)) [code, detail] = ["WORD_NUMBER", `"${WORD_NUMBER_RE.exec(s)![0]}" is a figure that was not given`];
    else if (/[\[\]—]|\((estimated|allocated|calculated|synthetic)\)|^[^.:]{2,70}:\s*[\d€]/i.test(s)) [code, detail] = ["COPIED_FORMAT", "write a sentence in your own words, not a copy of the fact layout (label: value, dashes, brackets)"];

    if (!code) {
      for (const m of stripped.matchAll(NUM_RE)) {
        const n = norm(m[0]);
        const after = stripped.slice(m.index! + m[0].length);
        const unit = UNIT_AFTER.exec(after)?.[1]?.toLowerCase();
        const unitC = unit ? UNIT_CANON[unit] : undefined;
        const matches = allowed.filter((a) => a.n === n);
        if (matches.length === 0) {
          if (context.has(n)) continue;
          [code, detail] = ["UNSOURCED_NUMBER", `${m[0]} is not one of the figures given`];
          break;
        }
        if (unitC && !matches.some((a) => a.unit === unitC)) {
          [code, detail] = ["UNIT_MISMATCH", `${m[0]} ${unit} does not match the unit it was given with`];
          break;
        }
        used.push(...matches.map((a) => a.fact));
      }
    }

    if (!code) {
      const stray = view.sites.find((x) => !task.siteNames.includes(x.name) && (s.includes(x.name) || s.includes(x.city)));
      if (stray) [code, detail] = ["WRONG_SITE", `${stray.name} is not part of the facts given`];
    }

    if (code) reject(s, code, detail);
    else accepted.push({ text: s, facts: [...new Map(used.map((f) => [f.measureId, f])).values()].map((f) => ({ label: f.label, display: f.display, measureId: f.measureId })) });
  }

  // Whole-answer rules, applied only when no single sentence was already refused for a clearer reason.
  if (rejected.length === 0) {
    if (accepted.length > task.maxSentences) {
      for (const a of accepted.splice(task.maxSentences)) reject(a.text, "TOO_MANY", `more than ${task.maxSentences} sentences`);
    }
    const noFigure = task.kind !== "answer" && accepted.every((a) => a.facts.length === 0);
    if (noFigure && accepted.length) {
      reject(accepted.map((a) => a.text).join(" "), "NO_FIGURE", "no figure from the facts is stated");
      accepted.length = 0;
    }
    const usedFacts = task.facts.filter((f) => accepted.some((a) => a.facts.some((x) => x.measureId === f.measureId)));
    if (accepted.length && usesEstimate(usedFacts) && !accepted.some((a) => HEDGE_RE.test(a.text))) {
      reject(accepted.map((a) => a.text).join(" "), "MISSING_HEDGE", "uses an estimated or allocated figure without calling it an estimate");
      accepted.length = 0;
    }
  }

  const kept = accepted.map((a) => a.text);
  const feedback = rejected.length
    ? [
        "The checker refused:",
        ...rejected.map((r) => `- "${r.sentence}" → ${r.code}: ${r.detail}`),
        "Rewrite only what was refused, one sentence per line, and follow the rules. Copy figures exactly as listed under FACTS.",
      ].join("\n")
    : null;
  return { accepted, rejected, kept, feedback };
}
