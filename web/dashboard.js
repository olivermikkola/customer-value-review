/* global fetch */
// Customer Value Review: renders the view model from /api/view. Every number is a "cell" with a
// measure id; clicking one opens its evidence chain from /api/trace. No numbers are computed here.

const state = { meta: null, customer: "CUST001", period: "FY", baseline: "B_LOCAL", scenario: "base", priority: "overview", site: null, view: null, interp: null, sort: null, country: "all", stack: [] };

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || (v === false && !k.startsWith("aria-"))) continue;
    if (k === "class") n.className = v;
    else if (k.startsWith("aria-") && typeof v === "boolean") n.setAttribute(k, String(v));
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "data-tip") n.dataset.tip = v;
    else n.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};
const svgEl = (tag, attrs = {}, ...kids) => {
  const n = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const c of kids.flat()) if (c) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return n;
};

const STATUS = { synthetic: "Synthetic", calculated: "Calculated", allocated: "Allocated", estimated: "Estimated" };
const STATUS_HELP = {
  synthetic: "Summed straight from the synthetic data pack",
  calculated: "Calculated from synthetic values (ratios, averages, sums)",
  allocated: "Laundry-level figure allocated to this customer by washed-kg share",
  estimated: "Depends on an assumption (baseline, repair ratio, prices)",
};
const badge = (s) => el("span", { class: `badge ${s}`, "data-tip": STATUS_HELP[s] ?? "" }, STATUS[s] ?? s);

const METRIC = {
  wearers: ["Wearers", "avg/month"], util_pct: ["In active use", ""], unused_cost: ["Unused capital", "est."], excess_pieces: ["Surplus garments", ""],
  on_time_pct: ["On time", ""], req_per_1k: ["Requests /1k wearers", ""], avg_cycle_h: ["Cycle time", ""], rep_per_100: ["Repairs /100 wearers", ""],
  water_per_kg: ["Water per kg", ""], w_div_pct: ["Waste diverted", ""], kg: ["Washed", ""], alloc: ["Garments", "avg"], rep: ["Repairs", ""],
  sav_water_pct: ["Water saving", "vs. alt."], sav_co2_pct: ["Emission saving", "vs. alt."], sav_water: ["Water saved", "vs. alt."], sav_co2: ["Emissions saved", "vs. alt."],
};
// +1: a higher value is worse; -1: a lower value is worse; 0: just a size
const WORSE = { unused_cost: 1, excess_pieces: 1, water_per_kg: 1, req_per_1k: 1, avg_cycle_h: 1, util_pct: -1, on_time_pct: -1, sav_water_pct: -1, sav_co2_pct: -1, w_div_pct: -1 };
const COLUMNS = {
  overview: ["wearers", "util_pct", "on_time_pct", "sav_water_pct", "rep_per_100"],
  water: ["water_per_kg", "sav_water_pct", "sav_water", "kg"],
  emissions: ["sav_co2_pct", "sav_co2", "kg", "rep_per_100"],
  cost: ["util_pct", "excess_pieces", "unused_cost", "alloc", "wearers"],
  circularity: ["rep", "rep_per_100", "w_div_pct", "kg"],
  service: ["on_time_pct", "avg_cycle_h", "req_per_1k", "wearers"],
};

// ------------------------------------------------------------------ data
const api = (path, params) => fetch(`/api/${path}?${new URLSearchParams(params)}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${path}: ${r.status}`))));

async function load() {
  const view = await api("view", { customer: state.customer, period: state.period, baseline: state.baseline, scenario: state.scenario, priority: state.priority });
  state.view = view;
  render();
  writeHash();
}

function writeHash() {
  const p = new URLSearchParams({ c: state.customer, p: state.period, b: state.baseline, s: state.scenario, f: state.priority });
  if (state.site) p.set("site", state.site);
  history.replaceState(null, "", `#${p}`);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const set = (k, key) => p.get(k) && (state[key] = p.get(k));
  set("c", "customer"); set("p", "period"); set("b", "baseline"); set("s", "scenario"); set("f", "priority"); set("site", "site");
}

async function init() {
  state.meta = await api("meta", {});
  readHash();
  if (!location.hash) {
    // Start from the priority the customer's industry ranks first.
    const v = await api("view", { customer: state.customer });
    state.priority = v.industry.defaultPriority;
  }
  await load();
}

// ----------------------------------------------------------------- chrome
function renderControls() {
  const m = state.meta;
  const sel = (label, value, options, onchange) =>
    el("label", { class: "field" }, el("span", {}, label), el("select", { class: "select", onchange: (e) => onchange(e.target.value) }, options.map(([v, t]) => el("option", { value: v, selected: v === value }, t))));
  const seg = (label, value, options, onchange) =>
    el("div", { class: "field" }, el("span", {}, label), el("div", { class: "seg", role: "group", "aria-label": label }, options.map(([v, t]) => el("button", { type: "button", "aria-pressed": v === value, onclick: () => onchange(v) }, t))));
  const c = $("controls");
  c.replaceChildren(
    sel("Customer", state.customer, m.customers.map((x) => [x.id, x.name]), (v) => { state.customer = v; state.site = null; state.priority = "overview"; resetToIndustry(); }),
    seg("Period", state.period, m.periods.map((p) => [p.id, p.id === "FY" ? "2025" : p.id]), (v) => { state.period = v; load(); }),
    sel("Compare with", state.baseline, m.baselines.map((b) => [b.id, b.name]), (v) => { state.baseline = v; load(); }),
    seg("Assumptions", state.scenario, m.scenarios.map((s) => [s, s[0].toUpperCase() + s.slice(1)]), (v) => { state.scenario = v; load(); }),
  );
}
async function resetToIndustry() {
  const v = await api("view", { customer: state.customer });
  state.priority = v.industry.defaultPriority;
  state.interp = null;
  load();
}

// ---------------------------------------------------------------- tooltip
const tip = $("tip");
document.addEventListener("pointerover", (e) => {
  const t = e.target.closest?.("[data-tip]");
  if (!t || !t.dataset.tip) return (tip.hidden = true);
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
});
document.addEventListener("pointermove", (e) => {
  if (tip.hidden) return;
  tip.style.left = `${Math.min(e.clientX + 14, innerWidth - 280)}px`;
  tip.style.top = `${e.clientY + 16}px`;
});
document.addEventListener("pointerout", (e) => { if (!e.relatedTarget?.closest?.("[data-tip]")) tip.hidden = true; });

// --------------------------------------------------------------- evidence
function openEvidence(id) {
  state.stack = [id];
  showTrace();
}
async function showTrace() {
  const d = $("drawer");
  d.classList.add("on"); $("scrim").classList.add("on"); d.setAttribute("aria-hidden", "false");
  const id = state.stack[state.stack.length - 1];
  const t = await api("trace", { customer: state.customer, measure: id });
  const close = el("button", { class: "x", type: "button", onclick: closeDrawer }, "Close ✕");
  const crumbs = el("div", { class: "crumbs" }, state.stack.slice(0, -1).map((s, i) => el("button", { type: "button", onclick: () => { state.stack = state.stack.slice(0, i + 1); showTrace(); } }, `← ${s.split(":").slice(1, 3).join(" · ")}`)));
  d.replaceChildren(...[
    close, crumbs,
    el("div", {}, el("p", { class: "muted" }, t.label), el("div", { class: "big" }, t.display)),
    el("div", { class: "chips" }, badge(t.status), el("span", { class: "badge" }, `confidence: ${t.confidence}`), el("span", { class: "badge" }, `${t.period.from} → ${t.period.to}`)),
    el("p", { class: t.recomputes ? "ok" : "muted" }, t.recomputes ? "✓ Recomputed just now from the inputs below: same value." : "Does not recompute."),
    el("div", {}, el("h3", {}, "Formula"), el("div", { class: "formula" }, t.formula)),
    el("div", {}, el("h3", {}, `Inputs (${t.inputCount})`), el("p", { class: "muted" }, "Click a measure to open its own inputs. Sources point at the cell in the data pack.")),
    el("div", { class: "inputs" }, t.inputs.map((i) => inputRow(i))),
    t.truncated ? el("p", { class: "muted" }, `Showing the first ${t.inputs.length} of ${t.inputCount} inputs.`) : null,
  ].filter(Boolean));
  d.scrollTop = 0;
}
function inputRow(i) {
  const body = [
    el("div", {}, el("span", { class: "kind" }, i.kind), " ", el("b", {}, i.label), el("small", {}, i.kind === "measure" ? `${i.scope} · ${i.period.from} → ${i.period.to}` : `${i.source ?? ""}${i.dataStatus ? ` · ${i.dataStatus}` : ""}`), el("small", {}, `${i.name} = ${i.ref}`)),
    el("div", { style: "text-align:right" }, el("b", {}, i.display), el("div", {}, badge(i.status))),
  ];
  return i.kind === "measure" ? el("button", { class: "inp", type: "button", onclick: () => { state.stack.push(i.ref); showTrace(); } }, body) : el("div", { class: "inp" }, body);
}
function closeDrawer() {
  $("drawer").classList.remove("on"); $("scrim").classList.remove("on"); $("drawer").setAttribute("aria-hidden", "true");
}
$("scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", (e) => e.key === "Escape" && closeDrawer());

const num = (cell, attrs = {}) => el("button", { class: "link", type: "button", onclick: () => openEvidence(cell.id), "data-tip": `${STATUS[cell.status]} · click for evidence`, ...attrs }, cell.display);

// ----------------------------------------------------------------- render
function render() {
  renderControls();
  const v = state.view;
  const app = $("app");
  app.replaceChildren(hero(v), kpis(v), observations(v), comparison(v), sitesSection(v), trends(v), repairsSection(v), method(v));
  if (state.site) {
    const row = document.querySelector("tr.sel");
    row?.scrollIntoView({ block: "nearest" });
  }
}

function hero(v) {
  const m = state.meta;
  const sub = `${v.customer.industry} · ${v.customer.siteCount} delivery sites in ${v.customer.countries.join(", ")} · ${v.periodLabel}`;
  const input = el("input", { id: "askInput", type: "text", maxlength: 300, placeholder: "Ask for a view, e.g. “Focus on water and emissions for Q3”", "aria-label": "Ask for a tailored view", value: state.askText ?? "" });
  const submit = async (text) => {
    state.askText = text;
    const r = await api("ask", { customer: state.customer, q: text });
    state.interp = r;
    state.priority = r.priority;
    if (r.baseline) state.baseline = r.baseline;
    if (r.period) state.period = r.period;
    state.site = r.siteId ?? state.site;
    load();
  };
  const exampleFor = m.prompts.filter((p) => p.who === "KAM" || p.who === "Customer").slice(0, 4);
  return el("section", { class: "hero" },
    el("div", { class: "card hero-main" },
      el("div", {}, el("p", { class: "eyebrow" }, "Annual customer review"), el("h1", {}, v.customer.name), el("p", { class: "sub" }, sub)),
      el("div", {}, el("p", { class: "eyebrow", style: "margin-bottom:8px" }, "What matters most?"),
        el("div", { class: "chips", role: "group", "aria-label": "Priority" }, m.priorities.map((p) => el("button", { class: "chip", type: "button", "aria-pressed": p.id === state.priority, "data-tip": p.blurb, onclick: () => { state.priority = p.id; state.interp = null; state.askText = ""; load(); } }, p.label)))),
      el("form", { class: "ask", onsubmit: (e) => { e.preventDefault(); if (input.value.trim()) submit(input.value.trim()); } }, input, el("button", { class: "btn primary", type: "submit" }, "Tailor view")),
      el("div", { class: "chips" }, exampleFor.map((p) => el("button", { class: "chip ghost", type: "button", onclick: () => { input.value = p.prompt; submit(p.prompt); } }, p.prompt))),
      state.interp ? el("p", { class: "interp" }, `Understood “${state.interp.text}” as: ${state.interp.matched.join(" · ") || "no specific focus, showing the overall view"}. Rules do this, not a model, so the same words always give the same view.`) : null,
    ),
    el("aside", { class: "card why" },
      el("h3", {}, `What ${v.customer.industry.toLowerCase()} customers usually care about`),
      el("p", { class: "muted" }, "Industry emphasis from the data pack. It orders the observations below; the numbers don't change."),
      el("ol", {}, v.industry.emphasis.map((e) => el("li", { class: e.priority === state.priority ? "on" : "" }, el("span", { class: "rk" }, e.rank), el("div", {}, el("b", {}, e.theme), el("small", {}, e.emphasis))))),
    ),
  );
}

function kpis(v) {
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "Value created"), el("p", {}, `Ordered for “${labelOf(state.priority)}”. Every figure opens its evidence. ${v.baselineLabel} is the comparison; ${state.scenario} case.`)),
    el("div", { class: "kpis" }, v.kpis.map((k, i) => kpiTile(k, i === 0))),
  );
}
function labelOf(id) { return state.meta.priorities.find((p) => p.id === id)?.label ?? id; }

function kpiTile(k, first) {
  const c = k.cell;
  let range = null;
  if (k.range) {
    const lo = k.range.low.value, hi = k.range.high.value;
    const span = hi - lo || 1;
    const pos = Math.max(0, Math.min(100, ((c.value - lo) / span) * 100));
    range = el("div", { class: "r" }, el("div", { class: "rangebar", "aria-hidden": "true" }, el("i", { style: "left:0;right:0" }), el("b", { style: `left:${pos}%` })), el("span", {}, `${k.range.low.display} to ${k.range.high.display} (low to high)`));
  }
  return el("button", { class: `card kpi${first ? " first" : ""}`, type: "button", onclick: () => openEvidence(c.id) },
    el("div", { class: "l" }, el("span", {}, k.label), badge(c.status)),
    el("div", { class: "v" }, c.display),
    el("div", { class: "s" }, k.sub ?? ""),
    range,
  );
}

function observations(v) {
  const obs = v.observations.slice(0, 4);
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "What to discuss"), el("p", {}, "Generated by transparent rules from the numbers above, ranked by your priority and the industry. Each names its evidence, a question for the meeting and an action.")),
    el("div", { class: "obs-grid" }, obs.map((o, i) =>
      el("article", { class: `card obs${i === 0 ? " top" : ""}` },
        el("div", { class: "tag" }, el("span", { class: `tone ${o.tone}` }), el("span", {}, { act: "Act on", watch: "Watch", good: "Value" }[o.tone]), el("span", { class: "src-tag" }, `· ${labelOf(o.theme)} · rules-generated`)),
        el("h3", {}, o.headline),
        el("p", { class: "detail" }, o.detail),
        el("div", { class: "ev" }, o.evidence.map((e) => el("button", { type: "button", onclick: () => openEvidence(e.cell.id) }, e.label, " ", el("b", {}, e.cell.display)))),
        el("div", { class: "disc" }, el("small", {}, "Question for the meeting"), o.discuss),
        el("div", { class: "act-row" }, el("span", {}, el("b", {}, "Action: "), o.action.title), el("span", { class: "effort" }, `${o.action.effort} effort`)),
        el("p", { class: "caveat" }, el("b", {}, "Limits: "), o.caveat),
      ))),
    el("div", { class: "card discussion" }, el("h3", {}, "Discussion points for the steering committee"), el("ol", {}, v.discussion.map((d) => el("li", {}, d)))),
  );
}

function comparison(v) {
  const maxOf = (r) => Math.max(r.actual.value, r.alternative.value);
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, `Circular service vs. ${v.baselineLabel.toLowerCase()}`), el("p", {}, "Same textiles, washed two ways. The alternative uses an illustrative per-kg value from the data pack; the ranges show how the answer moves if that value is 20 % lower or higher.")),
    el("div", { class: "cmp" },
      el("div", { class: "card cmp-main" },
        el("div", { class: "legend" }, el("span", {}, el("i", { style: "background:var(--accent)" }), "Lindström service (allocated)"), el("span", {}, el("i", { style: "background:var(--alt)" }), `${v.baselineLabel} (assumed)`)),
        v.comparison.rows.map((r) =>
          el("div", { class: "pair" },
            el("div", { class: "name" }, el("b", {}, r.label), el("small", {}, `${r.pct.display} lower`)),
            el("div", { class: "bars" },
              barRow(r.actual, maxOf(r), "a", "Service"),
              barRow(r.alternative, maxOf(r), "b", "Alternative"),
              el("div", { class: "save" }, "Saving ", num(r.saving), el("span", { class: "muted", style: "font-weight:400" }, ` · range ${r.low.display} to ${r.high.display}`)),
            ),
          )),
      ),
      el("div", { class: "card cmp-side" },
        el("h3", {}, "Other alternatives"),
        el("p", { class: "muted" }, `Same data, ${state.scenario} case.`),
        el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Alternative"), el("th", { class: "num" }, "Water"), el("th", { class: "num" }, "Emissions"))),
          el("tbody", {}, v.comparison.byBaseline.map((b) => el("tr", {}, el("td", {}, b.id === state.baseline ? el("b", {}, b.label) : el("button", { class: "link", type: "button", onclick: () => { state.baseline = b.id; load(); } }, b.label)), el("td", { class: "num" }, num(b.waterPct)), el("td", { class: "num" }, num(b.co2Pct)))))),
        el("p", { class: "muted" }, "Home washing is assumed to use the most water and have no central delivery. Pick one to switch the whole page."),
      ),
    ),
  );
}
function barRow(cell, max, cls, name) {
  return el("div", { class: "bar-row" }, el("div", { class: "track", role: "img", "aria-label": `${name} ${cell.display}` }, el("i", { class: cls, style: `width:${Math.max(1, (cell.value / max) * 100)}%` })), el("span", {}, `${name} `, el("b", {}, num(cell))));
}

function sitesSection(v) {
  const cols = COLUMNS[state.priority];
  const countries = [...new Set(v.sites.map((s) => s.country))];
  let rows = v.sites.filter((s) => state.country === "all" || s.country === state.country);
  const sortKey = state.sort?.key ?? cols[0];
  const dir = state.sort?.dir ?? (WORSE[sortKey] === -1 ? 1 : -1);
  rows = [...rows].sort((a, b) => (a.m[sortKey].value - b.m[sortKey].value) * dir);
  const maxOf = Object.fromEntries(cols.map((c) => [c, Math.max(...rows.map((s) => Math.abs(s.m[c].value)), 1e-9)]));
  const spread = Object.fromEntries(cols.map((c) => { const vs = rows.map((s) => Math.abs(s.m[c].value)); return [c, (Math.max(...vs) - Math.min(...vs)) / (Math.max(...vs) || 1)]; }));
  const flagged = {};
  for (const c of cols) if (WORSE[c]) flagged[c] = new Set([...rows].sort((a, b) => (a.m[c].value - b.m[c].value) * -WORSE[c]).slice(0, 3).map((s) => s.id));
  const th = (c) => el("th", { class: "num", "aria-sort": sortKey === c ? (dir > 0 ? "ascending" : "descending") : null }, el("button", { type: "button", onclick: () => { state.sort = { key: c, dir: sortKey === c ? -dir : dir }; render(); } }, METRIC[c][0], sortKey === c ? (dir > 0 ? " ↑" : " ↓") : ""));
  const sel = v.sites.find((s) => s.id === state.site);
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "Sites"), el("p", {}, "Customer-level view with drill-down. ▲ marks the three least favourable sites per column. Select a row for the site detail.")),
    el("div", { class: "filters" }, el("div", { class: "chips" }, ["all", ...countries].map((c) => el("button", { class: "chip", type: "button", "aria-pressed": state.country === c, onclick: () => { state.country = c; render(); } }, c === "all" ? "All countries" : c)))),
    sel ? sitePanel(v, sel) : null,
    el("div", { class: "card sites" },
      el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Site"), cols.map(th))),
        el("tbody", {}, rows.map((s) => el("tr", { class: s.id === state.site ? "sel" : "", tabindex: 0, onclick: () => { state.site = s.id === state.site ? null : s.id; render(); writeHash(); }, onkeydown: (e) => e.key === "Enter" && e.currentTarget.click() },
          el("td", { class: "site-name" }, el("b", {}, s.name), el("small", {}, `${s.city}, ${s.country} · ${s.type}`)),
          cols.map((c) => { const cell = s.m[c]; const flag = flagged[c]?.has(s.id); return el("td", { class: "num" }, el("div", { class: `cellbar${flag ? " flag" : ""}` }, spread[c] > 0.25 ? el("i", { style: `width:${Math.round((Math.abs(cell.value) / maxOf[c]) * 56)}px` }) : null, el("span", {}, cell.display))); }),
        ))),
        el("tfoot", {}, el("tr", {}, el("td", { class: "site-name" }, el("b", {}, "Customer total / average")), cols.map((c) => el("td", { class: "num" }, num(v.customerMetrics[c])))))),
    ),
  );
}
function sitePanel(v, s) {
  const keys = ["wearers", "util_pct", "on_time_pct", "req_per_1k", "avg_cycle_h", "kg", "water_per_kg", "sav_water_pct", "sav_co2", "rep_per_100", "unused_cost", "w_div_pct"];
  return el("div", { class: "card sitepanel" },
    el("div", { class: "sec-head" }, el("div", {}, el("h3", {}, s.name), el("p", { class: "muted" }, `${s.city}, ${s.country} · ${s.type} · served by ${s.laundry}`)), el("button", { class: "btn", type: "button", onclick: () => { state.site = null; render(); writeHash(); } }, "Back to customer view")),
    el("div", { class: "mini-grid" }, keys.map((k) => {
      const c = s.m[k], avg = v.customerMetrics[k];
      const diff = avg.value ? ((c.value - avg.value) / Math.abs(avg.value)) * 100 : 0;
      const worse = WORSE[k] ? Math.sign(diff) === WORSE[k] : null;
      const tag = k === "wearers" || k === "kg" ? "" : Math.abs(diff) < 0.5 ? "in line with the customer" : `${Math.abs(diff).toFixed(0)} % ${diff > 0 ? "above" : "below"} the customer (${avg.display})`;
      return el("button", { class: "mini", type: "button", onclick: () => openEvidence(c.id) }, el("small", {}, METRIC[k][0]), el("b", {}, c.display), el("em", { class: worse === null ? "" : worse ? "down" : "up" }, tag));
    })),
  );
}

// ------------------------------------------------------------------ charts
function lineChart(series, { w = 300, h = 110, fmt }) {
  const pad = { l: 6, r: 6, t: 10, b: 20 };
  const xs = series.points.map((_, i) => pad.l + (i * (w - pad.l - pad.r)) / Math.max(1, series.points.length - 1));
  const vals = series.points.map((p) => p.cell.value);
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const span = hi - lo || Math.abs(hi) * 0.1 || 1;
  const min = lo - span * 0.35, max = hi + span * 0.35;
  const y = (v) => pad.t + (1 - (v - min) / (max - min)) * (h - pad.t - pad.b);
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", role: "img", "aria-label": `${series.label}: ${series.points.map((p) => `${p.period} ${p.cell.display}`).join(", ")}` });
  svg.append(svgEl("line", { x1: pad.l, x2: w - pad.r, y1: h - pad.b, y2: h - pad.b, class: "grid" }));
  svg.append(svgEl("polyline", { points: xs.map((x, i) => `${x},${y(vals[i])}`).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  series.points.forEach((p, i) => {
    svg.append(svgEl("text", { x: xs[i], y: h - 5, "text-anchor": i === 0 ? "start" : i === series.points.length - 1 ? "end" : "middle" }, p.period));
    const dot = svgEl("circle", { cx: xs[i], cy: y(vals[i]), r: 4, fill: "var(--accent)", stroke: "var(--surface)", "stroke-width": 2, style: "cursor:pointer" });
    const hit = svgEl("circle", { cx: xs[i], cy: y(vals[i]), r: 14, fill: "transparent", style: "cursor:pointer", "data-tip": `${series.label}: ${p.cell.display} in ${p.period}` });
    hit.addEventListener("click", () => openEvidence(p.cell.id));
    svg.append(dot, hit);
  });
  return svg;
}
function barChart(series, { w = 420, h = 130 }) {
  const pad = { l: 4, r: 4, t: 8, b: 20 };
  const vals = series.points.map((p) => p.cell.value);
  const max = Math.max(...vals) * 1.08 || 1;
  const bw = (w - pad.l - pad.r) / vals.length;
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, width: "100%", role: "img", "aria-label": `${series.label} by month` });
  svg.append(svgEl("line", { x1: pad.l, x2: w - pad.r, y1: h - pad.b, y2: h - pad.b, class: "grid" }));
  series.points.forEach((p, i) => {
    const bh = (p.cell.value / max) * (h - pad.t - pad.b);
    const x = pad.l + i * bw + 3;
    const r = svgEl("path", { d: `M${x},${h - pad.b} v${-Math.max(bh - 4, 0)} q0,-4 4,-4 h${bw - 14} q4,0 4,4 v${Math.max(bh - 4, 0)} z`, fill: "var(--accent)", style: "cursor:pointer", "data-tip": `${p.period}: ${p.cell.display}` });
    r.addEventListener("click", () => openEvidence(p.cell.id));
    svg.append(r, svgEl("text", { x: x + (bw - 6) / 2, y: h - 5, "text-anchor": "middle" }, "JFMAMJJASOND"[i]));
  });
  return svg;
}
function dataTable(series) {
  return el("details", { class: "tbl" }, el("summary", {}, "Data table"), el("table", {}, el("tbody", {}, series.points.map((p) => el("tr", {}, el("td", {}, p.period), el("td", { class: "num" }, num(p.cell)))))));
}

function trends(v) {
  const q = v.series.quarterly;
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "Through the year"), el("p", {}, "Quarter by quarter for the whole customer. Point at a mark for the value, click it for evidence.")),
    el("div", { class: "charts" }, q.map((s) => el("div", { class: "card chart" }, el("h3", {}, s.label), el("div", { class: "big" }, s.points[s.points.length - 1].cell.display), lineChart(s, {}), dataTable(s)))),
    el("div", { class: "two" }, v.series.monthly.filter((s) => ["kg", "rep"].includes(s.key)).map((s) => el("div", { class: "card chart" }, el("h3", {}, `${s.label}, monthly`), barChart(s, {}), dataTable(s)))),
  );
}

function repairsSection(v) {
  const r = v.repairs;
  const maxT = Math.max(...r.byType.map((t) => t.cell.value));
  const maxP = Math.max(...r.byProduct.map((t) => t.cell.value));
  const routes = v.circularity.routes;
  const tot = routes.reduce((a, x) => a + x.cell.value, 0) || 1;
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "Repair and circularity"), el("p", {}, "Repair keeps garments in service longer. The avoided-replacement figures rest on one assumption, so they are shown as a range.")),
    el("div", { class: "two" },
      el("div", { class: "card panel" }, el("h3", {}, "Repairs by type"),
        r.byType.map((t) => el("div", { class: "hbar" }, el("span", {}, t.label), el("div", { class: "track" }, el("i", { style: `width:${(t.cell.value / maxT) * 100}%` })), num(t.cell))),
        el("h3", { style: "margin-top:6px" }, "Repairs by product"),
        r.byProduct.map((t) => el("div", { class: "hbar" }, el("span", {}, t.label), el("div", { class: "track" }, el("i", { style: `width:${(t.cell.value / maxP) * 100}%` })), num(t.cell))),
      ),
      el("div", { class: "card panel" }, el("h3", {}, "Handprint from repairs (estimate)"),
        el("p", { class: "muted" }, "Low assumes half of repairs avoid a replacement. Base is the data pack’s own assumption: one repair postpones one replacement."),
        r.handprint.map((h) => el("div", { class: "rng" }, el("div", {}, h.label, el("small", {}, `range ${h.low.display} to ${h.high.display}`)), el("div", { style: "text-align:right" }, num(h.base), el("div", {}, badge("estimated"))))),
        el("h3", { style: "margin-top:6px" }, "Where textile waste goes"),
        el("div", { class: "stack", role: "img", "aria-label": routes.map((x) => `${x.label} ${x.cell.display}`).join(", ") }, routes.map((x, i) => el("i", { class: `s${i + 1}`, style: `width:${(x.cell.value / tot) * 100}%`, "data-tip": `${x.label}: ${x.cell.display}` }))),
        el("div", { class: "legend" }, routes.map((x, i) => el("span", {}, el("i", { class: `s${i + 1}` }), `${x.label} `, num(x.cell)))),
        el("p", { class: "muted" }, `${v.circularity.diverted.display} stays out of incineration. Allocated from laundry totals by washed-kg share; the baseline assumes all textile waste would go to mixed waste.`),
      ),
    ),
  );
}

function method(v) {
  const m = state.meta;
  return el("section", {},
    el("div", { class: "sec-head" }, el("h2", {}, "Method, limits and data gaps"), el("p", {}, "What this prototype can and cannot say.")),
    el("div", { class: "card panel" }, el("h3", {}, "How to read a number"), el("div", { class: "legend-status" }, Object.keys(STATUS).map((s) => el("span", {}, badge(s), " ", STATUS_HELP[s])))),
    el("div", { class: "card gaps" }, v.gaps.map((g) => el("div", { class: "gap" }, el("span", { class: `sev ${g.severity}` }, g.severity), el("span", {}, g.text)))),
    el("div", { class: "card panel" }, el("h3", {}, "Assumptions"),
      el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "ID"), el("th", {}, "Assumption"), el("th", {}, "Rule"), el("th", {}, "Confidence"))),
        el("tbody", {}, m.assumptions.map((a) => el("tr", {}, el("td", {}, a.id), el("td", {}, a.name), el("td", {}, a.rule), el("td", {}, a.confidence)))))),
    el("p", { class: "muted" }, "Not an audited sustainability report. All figures are synthetic or estimated and must not be presented as real Lindström or customer performance."),
  );
}

init().catch((e) => { $("app").replaceChildren(el("p", { class: "loading" }, `Could not load: ${e.message}`)); });
