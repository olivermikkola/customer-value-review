/* global fetch */

const state = { data: null, lens: "sustainability", selected: null, accepted: false, jumped: false };

const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return node;
};

const num = (n, d = 1) =>
  Number(n).toLocaleString("fi-FI", { minimumFractionDigits: d, maximumFractionDigits: d });

const obs = () => state.data.observations[state.lens];
const current = () => obs().find((o) => o.id === state.selected) ?? obs()[0];

const SEVERITY = { act: "TOIMI", watch: "SEURAA", info: "TIEDOKSI" };

init();

async function init() {
  const data = await fetch("/data.json").then((r) => r.json());
  state.data = data;
  state.selected = data.observations[state.lens][0].id;
  document.getElementById("customer").textContent = `${data.customer} · ${data.period}`;
  document.getElementById("period").textContent = `vs. ${data.comparePeriod}`;
  renderLens();
  renderChips();
  renderAll();
}

function renderLens() {
  const host = document.getElementById("lens");
  host.replaceChildren(
    ...state.data.lenses.map((l) =>
      el(
        "button",
        {
          role: "tab",
          "aria-selected": String(l.id === state.lens),
          onclick: () => {
            state.lens = l.id;
            state.selected = obs()[0].id;
            renderLens();
            renderAll();
          },
        },
        l.label,
      ),
    ),
  );
}

function renderChips() {
  const host = document.getElementById("chips");
  host.replaceChildren(
    ...state.data.qa.map((item) =>
      el("button", { class: "chip", onclick: () => showAnswer(item) }, item.question),
    ),
  );
}

function showAnswer(item) {
  const host = document.getElementById("answer");
  host.hidden = false;
  host.className = `answer ${item.code ? "bad" : "ok"}`;
  host.replaceChildren(
    ...(item.code ? [el("span", { class: "code" }, item.code)] : []),
    ...item.lines.map((line) => el("p", { class: line.ok ? "" : "muted" }, line.text)),
  );
}

function renderAll() {
  renderList();
  renderDetail();
  renderLedger();
}

/* ---------------- list ---------------- */

function renderList() {
  const max = Math.max(...obs().map((o) => o.rank), 0.0001);
  const host = document.getElementById("list");
  host.replaceChildren(
    ...obs().map((o, i) =>
      el(
        "button",
        {
          class: `card sev-${o.severity}`,
          "aria-current": String(o.id === current().id),
          onclick: () => {
            state.selected = o.id;
            renderList();
            renderDetail();
          },
        },
        el(
          "div",
          { class: "card-top" },
          el("span", { class: "sev" }, SEVERITY[o.severity] ?? ""),
          el("span", { class: "ranknum" }, `${i + 1}/${obs().length} · ${num(o.rank, 2)}`),
        ),
        el("h3", {}, o.headline),
        el(
          "div",
          { class: "value" },
          formatDelta(o),
          el("small", {}, o.claim.confidence === "measured" ? "mitattu" : o.claim.confidence),
        ),
        el("div", { class: "rankbar" }, el("i", { style: `width:${(o.rank / max) * 100}%` })),
      ),
    ),
  );
}

function formatDelta(o) {
  return o.claim.display;
}

/* ---------------- detail ---------------- */

function renderDetail() {
  const o = current();
  const host = document.getElementById("detail");
  const index = obs().findIndex((x) => x.id === o.id) + 1;
  const isLevel = o.claim.kind === "level" || o.claim.kind === "avoided_impact";
  host.replaceChildren(
    el(
      "div",
      { class: "detail-head" },
      el("div", { class: "eyebrow" }, `HAVAINTO ${index} / ${obs().length} · ${SEVERITY[o.severity]}`),
      el("h1", {}, o.headline),
      el("div", { class: "big" }, o.claim.display),
      el(
        "div",
        { class: "meta" },
        isLevel
          ? "taso tällä jaksolla"
          : `verrattuna ${o.claim.comparedTo ?? state.data.comparePeriod}`,
        " · luottamus ",
        el("span", { class: `badge ${o.claim.confidence}` }, o.claim.confidence),
      ),
      o.check ? el("div", { class: "checkline" }, o.check) : null,
    ),
    o.measures.length ? chainBlock(o) : null,
    driverBlock(o),
    optionsBlock(o),
  );
}


function chainBlock(o) {
  return el(
    "section",
    { class: "block" },
    el("h2", {}, "Mistä luku tulee"),
    ...o.measures.map((m) => nodeView(m, true)),
    el("div", { class: "recheck" }, "Laskettu uudelleen kaavasta ja syötteistä — ei tallennettu arvo"),
  );
}

function nodeView(m, root = false) {
  return el(
    "div",
    { class: `node ${root ? "node-root" : ""}` },
    el(
      "div",
      { class: "node-row" },
      el("span", { class: "node-label" }, m.label),
      el("span", { class: "node-value" }, m.value),
    ),
    m.formula ? el("div", { class: "node-formula" }, m.formula) : null,
    ...m.factors.map((f) => el("div", { class: "factor" }, f)),
    m.sources.length
      ? el(
          "div",
          { class: "node-sources" },
          `${m.sources.length} raakatapahtumaa · ${m.sources[0].ref}${m.sources.length > 1 ? " …" : ""}`,
        )
      : null,
    m.children.length ? el("div", { class: "node-children" }, ...m.children.map((c) => nodeView(c))) : null,
  );
}

function driverBlock(o) {
  const known = o.drivers.filter((d) => d.share !== null);
  const knownShare = known.reduce((a, d) => a + d.share, 0);
  const gap = Math.max(0, 1 - knownShare);
  const total = knownShare + gap;

  return el(
    "section",
    { class: "block" },
    el("h2", {}, "Mitä se selittää"),
    o.drivers.length
      ? el(
          "div",
          {},
          el(
            "div",
            { class: "stacked" },
            el(
              "div",
              { class: "track", style: "height:12px" },
              known.map((d) => el("i", { style: `width:${(d.share / total) * 100}%` })),
              gap > 0 ? el("i", { class: "gap", style: `width:${(gap / total) * 100}%` }) : null,
            ),
          ),
          el(
            "div",
            { class: "legend" },
            el("span", {}, `selitetty ${Math.round(knownShare * 100)} %`),
            gap > 0 ? el("span", { class: "gap" }, `selittämätön ${Math.round(gap * 100)} %`) : null,
          ),
          ...o.drivers.map((d) =>
            el(
              "div",
              { class: "driver", style: "margin-top:14px" },
              el(
                "div",
                { class: "driver-head" },
                el("span", {}, d.label),
                el("span", { class: "driver-share" }, d.share === null ? "—" : `${num(d.share * 100, 1)} %`),
              ),
              el(
                "div",
                { class: "driver-note" },
                d.method === "hypothesis"
                  ? `hypoteesi · ${d.amount ?? "?"} yksikköä · syytä ei ole vahvistettu`
                  : `${d.method} · ${d.amount ?? "?"} yksikköä`,
              ),
            ),
          ),
        )
      : el(
          "p",
          { class: "muted" },
          "Ei vahvistettua syy-reunaa. Muutos on havaittu, mutta sitä ei ole selitetty — eikä sitä väitetä selitetyksi.",
        ),
  );
}

function optionsBlock(o) {
  const recs = state.data.recommendations.filter((r) => r.observationId === o.id);
  if (!recs.length) return null;

  return el(
    "section",
    { class: "block" },
    el("h2", {}, "Mitä kannattaa tehdä"),
    ...recs.map((r) =>
      el(
        "div",
        { class: `option ${r.id === "rec:batch-consolidation" ? "recommended" : ""}` },
        el(
          "div",
          { class: "option-top" },
          el("h3", {}, r.title),
          el("span", { class: "badge" }, r.effort === "low" ? "helppo" : r.effort === "medium" ? "keskitaso" : "raskas"),
        ),
        el("p", {}, r.rationale),
        el(
          "div",
          { class: "impacts" },
          ...r.expectedImpact.map((i) =>
            el(
              "span",
              { class: `impact ${i.delta < 0 ? "good" : "bad"}` },
              `${i.delta > 0 ? "+" : ""}${num(i.delta, 1)} % ${metricName(i.metricId)}`,
            ),
          ),
        ),
        ...r.tradeoffs.map((t) =>
          el("div", { class: "tradeoff" }, `${t.note}${t.delta ? ` (${t.delta > 0 ? "+" : ""}${num(t.delta, 1)} %)` : ""}`),
        ),
        r.measurable
          ? el(
              "div",
              { style: "margin-top:12px" },
              el(
                "button",
                {
                  class: "btn",
                  disabled: state.accepted,
                  onclick: () => {
                    state.accepted = true;
                    state.jumped = false;
                    renderLedger();
                    renderDetail();
                  },
                },
                state.accepted ? "Sitoumus luotu" : "Hyväksy ja seuraa",
              ),
            )
          : el("div", { class: "unmeasurable" }, "Ei mitattavissa tässä datasetissä — siksi sitä ei voi hyväksyä."),
      ),
    ),
  );
}

function metricName(id) {
  return (
    {
      water_m3: "vettä",
      water_intensity: "veden ominaiskulutus",
      linen_kg: "pyykkiä",
      cost_eur: "kustannus",
      co2_kg: "CO₂",
    }[id] ?? id
  );
}

/* ---------------- ledger ---------------- */

function renderLedger() {
  const host = document.getElementById("ledger");
  const c = state.data.commitment;

  if (!state.accepted || !c) {
    host.replaceChildren(
      el(
        "div",
        { class: "ledger-inner" },
        el("span", { class: "ledger-label" }, "Sitoumukset"),
        el("span", { class: "ledger-empty" }, "Ei avoimia sitoumuksia. Havainto ei ole vielä teko."),
      ),
    );
    return;
  }

  const p = c.progress;

  if (!state.jumped) {
    host.replaceChildren(
      el(
        "div",
        { class: "ledger-inner" },
        el("span", { class: "ledger-label" }, "Sitoumus"),
        el(
          "div",
          { class: "commitment" },
          el("span", { class: "title" }, "B · Pesuerien optimointi"),
          el(
            "span",
            { class: "path" },
            `baseline ${num(p.baselineValue, 4)} → tavoite ${num(p.targetDelta, 1)} % · seuranta 15.1.2026`,
          ),
        ),
        el(
          "button",
          {
            class: "btn",
            onclick: () => {
              state.jumped = true;
              renderLedger();
            },
          },
          "Siirry Q4:ään →",
        ),
      ),
    );
    return;
  }

  host.replaceChildren(
    el(
      "div",
      { class: "ledger-inner" },
      el("span", { class: "ledger-label" }, "Tulos"),
      el(
        "div",
        { class: "result" },
        el("span", { class: "check" }, "✓"),
        el(
          "span",
          { class: "line" },
          `mitattu ${num(p.actualDelta, 1)} % (tavoite ${num(p.targetDelta, 1)} %) · `,
          el("b", {}, "tavoite ylitetty"),
        ),
      ),
      el(
        "div",
        { class: "followup" },
        ...state.data.followup.rows.slice(0, 3).map((r) =>
          el("span", {}, `${r.label} `, el("b", {}, r.delta)),
        ),
      ),
    ),
  );
}
