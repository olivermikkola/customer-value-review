/**
 * Customer-ready PowerPoint, generated from the same view model as the dashboard so the two cannot
 * disagree. Every slide names its sources and the status of its numbers; speaker notes list the
 * measure ids behind each figure so a presenter can open them in the dashboard.
 */
import PptxModule from "pptxgenjs";
import type { Cell, CustomerView } from "./view.ts";

const C = {
  ink: "101828", ink2: "475467", muted: "6B7686", line: "E4E7EC", bg: "F4F5F7", white: "FFFFFF",
  accent: "2A78D6", accentSoft: "E8F0FB", alt: "EB6834", good: "067647", warn: "93570C", warnSoft: "FDF3DC", act: "B42318",
};
const FONT = "Calibri";
const W = 13.333;
const STATUS = { synthetic: "Synthetic", calculated: "Calculated", allocated: "Allocated", estimated: "Estimated" } as Record<string, string>;

// pptxgenjs ships CommonJS typings; at runtime the default export is the class itself.
const PptxGenJS = PptxModule as unknown as typeof PptxModule.default;
type Slide = ReturnType<InstanceType<typeof PptxGenJS>["addSlide"]>;

/** pptxgenjs table typings are stricter than what it accepts at runtime (plain strings, string aligns). */
const tbl = (s: Slide, rows: unknown, opts: Record<string, unknown>) => s.addTable(rows as never, opts as never);

export function buildDeck(v: CustomerView): Promise<Buffer> {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.title = `${v.customer.name}: customer value review ${v.periodLabel}`;
  p.company = "Since AI Hackathon 2026 (synthetic data)";

  let n = 0;
  const notesFor = (cells: { label: string; cell: Cell }[]) => cells.map((c) => `${c.label}: ${c.cell.display} [${STATUS[c.cell.status]}] ${c.cell.id}`).join("\n");

  const base = (title: string, kicker: string, sources: string, cells: { label: string; cell: Cell }[] = []): Slide => {
    const s = p.addSlide();
    n++;
    s.background = { color: C.white };
    s.addText(kicker.toUpperCase(), { x: 0.6, y: 0.35, w: 9, h: 0.3, fontFace: FONT, fontSize: 11, color: C.muted, charSpacing: 2 });
    s.addText(title, { x: 0.6, y: 0.62, w: W - 1.2, h: 0.9, fontFace: FONT, fontSize: 26, bold: true, color: C.ink, valign: "top", fit: "shrink" });
    s.addShape(p.ShapeType.rect, { x: 0, y: 7.1, w: W, h: 0.4, fill: { color: C.warnSoft }, line: { color: C.warnSoft } });
    s.addText("Synthetic data from the Since AI Hackathon pack. Not real Lindström or customer performance, not audited.", { x: 0.6, y: 7.1, w: 9.6, h: 0.4, fontFace: FONT, fontSize: 10, color: C.warn, valign: "middle" });
    s.addText(`Sources: ${sources}`, { x: 0.6, y: 6.66, w: W - 1.9, h: 0.4, fontFace: FONT, fontSize: 9, color: C.muted, valign: "bottom", fit: "shrink" });
    s.addText(String(n), { x: W - 1.2, y: 6.66, w: 0.6, h: 0.4, fontFace: FONT, fontSize: 9, color: C.muted, align: "right", valign: "bottom" });
    if (cells.length) s.addNotes(`Evidence (open these ids in the dashboard):\n${notesFor(cells)}`);
    return s;
  };

  const tile = (s: Slide, x: number, y: number, w: number, label: string, cell: Cell, sub?: string, accent = false) => {
    s.addShape(p.ShapeType.roundRect, { x, y, w, h: 1.5, rectRadius: 0.08, fill: { color: accent ? C.accentSoft : C.white }, line: { color: accent ? C.accent : C.line, width: 1 } });
    s.addText(label, { x: x + 0.15, y: y + 0.1, w: w - 0.3, h: 0.3, fontFace: FONT, fontSize: 11, color: C.ink2 });
    s.addText(cell.display, { x: x + 0.15, y: y + 0.42, w: w - 0.3, h: 0.6, fontFace: FONT, fontSize: 28, bold: true, color: C.ink, fit: "shrink" });
    s.addText(`${sub ? sub + "  ·  " : ""}${STATUS[cell.status]}`, { x: x + 0.15, y: y + 0.98, w: w - 0.3, h: 0.5, valign: "top", fontFace: FONT, fontSize: 9.5, color: cell.status === "estimated" ? C.warn : C.muted, fit: "shrink" });
  };

  const priorityLabel = { overview: "Overall value", water: "Water", emissions: "Emissions", cost: "Cost & allocation", circularity: "Circularity", service: "Service performance" }[v.params.priority];
  const alt = v.baselineLabel.toLowerCase();

  // 1 · title
  {
    const s = p.addSlide();
    n++;
    s.background = { color: C.ink };
    s.addText("ANNUAL CUSTOMER REVIEW", { x: 0.8, y: 1.6, w: 9, h: 0.4, fontFace: FONT, fontSize: 14, color: "9FB3C8", charSpacing: 3 });
    s.addText(v.customer.name, { x: 0.8, y: 2.1, w: 11.5, h: 1.2, fontFace: FONT, fontSize: 48, bold: true, color: C.white });
    s.addText("Customer value and sustainability review", { x: 0.8, y: 3.3, w: 11.5, h: 0.6, fontFace: FONT, fontSize: 24, color: "D0D5DD" });
    s.addText(`${v.customer.industry}  ·  ${v.customer.siteCount} delivery sites in ${v.customer.countries.join(", ")}  ·  ${v.periodLabel}`, { x: 0.8, y: 4.1, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 14, color: "9FB3C8" });
    s.addText(`Focus: ${priorityLabel}  ·  Compared with: ${v.baselineLabel}  ·  ${v.params.scenario} case`, { x: 0.8, y: 4.5, w: 11.5, h: 0.4, fontFace: FONT, fontSize: 14, color: "9FB3C8" });
    s.addShape(p.ShapeType.rect, { x: 0.8, y: 6.1, w: 11.7, h: 0.8, fill: { color: "2E2410" }, line: { color: "93570C" } });
    s.addText("Synthetic data from the Since AI Hackathon 2026 pack. All figures are synthetic or estimated. This is a prototype, not an audited sustainability report, and must not be presented as real Lindström or customer performance.", { x: 1, y: 6.1, w: 11.3, h: 0.8, fontFace: FONT, fontSize: 12, color: "E5B04A", valign: "middle" });
  }

  // 2 · summary
  {
    const k = v.kpis.slice(0, 8);
    const s = base(`What ${v.customer.name} received in ${v.periodLabel.toLowerCase()}`, "Executive summary", "Service_Activity, Service_Cycles, Repairs, Laundry_Resources, Waste_Circularity, Baselines", k.map((x) => ({ label: x.label, cell: x.cell })));
    k.forEach((x, i) => tile(s, 0.6 + (i % 4) * 3.05, 1.75 + Math.floor(i / 4) * 1.75, 2.9, x.label, x.cell, x.range ? `${x.range.low.display} to ${x.range.high.display}` : x.sub, i === 0));
    s.addText(`Figures marked Estimated depend on an assumption and are shown with a low to high range where one applies. Ordered for “${priorityLabel}”.`, { x: 0.6, y: 5.35, w: 12, h: 0.5, fontFace: FONT, fontSize: 12, color: C.ink2 });
  }

  // 3 · what matters
  {
    const s = base("What this review focuses on, and why", "Priorities", "Industry_Priorities (data pack), Suggested_Prompts");
    s.addText(`${v.customer.industry} customers in the data pack rank these themes first. They decide what is emphasised here; the numbers do not change.`, { x: 0.6, y: 1.55, w: 12, h: 0.7, fontFace: FONT, fontSize: 14, color: C.ink2 });
    v.industry.emphasis.forEach((e, i) => {
      const y = 2.35 + i * 1.3;
      const on = e.priority === v.params.priority;
      s.addShape(p.ShapeType.roundRect, { x: 0.6, y, w: 12.1, h: 1.1, rectRadius: 0.08, fill: { color: on ? C.accentSoft : C.white }, line: { color: on ? C.accent : C.line } });
      s.addText(String(e.rank), { x: 0.8, y: y + 0.25, w: 0.6, h: 0.6, fontFace: FONT, fontSize: 22, bold: true, color: on ? C.accent : C.muted, align: "center" });
      s.addText(e.theme, { x: 1.6, y: y + 0.12, w: 10.8, h: 0.4, fontFace: FONT, fontSize: 17, bold: true, color: C.ink });
      s.addText(e.emphasis, { x: 1.6, y: y + 0.52, w: 10.8, h: 0.5, fontFace: FONT, fontSize: 13, color: C.ink2 });
    });
  }

  // 4 · value vs alternative
  {
    const rows = v.comparison.rows;
    const s = base(`Less water, energy and emissions than ${alt}`, "Value created", "Laundry_Resources, Waste_Circularity (allocated by washed-kg share), Baselines (illustrative)", rows.flatMap((r) => [{ label: `${r.label} actual`, cell: r.actual }, { label: `${r.label} alternative`, cell: r.alternative }, { label: `${r.label} saving`, cell: r.saving }]));
    // l → m³, kWh → MWh, kgCO2e → tCO2e: all ÷ 1000, matching the labels below
    const conv = (c: Cell) => c.value / 1000;
    const unit = { water: "m³", energy: "MWh", co2: "tCO₂e" } as Record<string, string>;
    rows.forEach((r, i) => {
      const x = 0.6 + i * 4.1;
      s.addText(r.label, { x, y: 1.65, w: 3.9, h: 0.35, fontFace: FONT, fontSize: 15, bold: true, color: C.ink });
      s.addChart(p.ChartType.bar, [{ name: unit[r.key]!, labels: ["Lindström service", v.baselineLabel], values: [conv(r.actual), conv(r.alternative)] }], {
        x, y: 2.0, w: 3.9, h: 2.8, barDir: "col", chartColors: [C.accent, C.alt], varyColors: true, showValue: true, dataLabelFontSize: 10, dataLabelFormatCode: "#,##0.0", dataLabelColor: C.ink,
        catAxisLabelFontSize: 9, valAxisHidden: true, valGridLine: { style: "none" }, showLegend: false, barGapWidthPct: 60,
      } as never);
      s.addText([{ text: `Saving ${r.saving.display}`, options: { bold: true, color: C.good, breakLine: true } }, { text: `${r.pct.display} lower  ·  range ${r.low.display} to ${r.high.display}`, options: { color: C.ink2 } }], { x, y: 4.9, w: 3.9, h: 0.7, fontFace: FONT, fontSize: 12 });
    });
    s.addText(`The alternative is an illustrative per-kg value from the data pack with a ±20 % prototype band. Water and emissions are laundry-level figures allocated to this customer by washed kilograms. Status: Estimated.`, { x: 0.6, y: 5.8, w: 12.1, h: 0.7, fontFace: FONT, fontSize: 11, color: C.warn });
  }

  // 5 · service
  {
    const cells = [v.customerMetrics.on_time_pct!, v.customerMetrics.avg_cycle_h!, v.customerMetrics.req_per_1k!];
    const s = base("Service performance: what the customer experienced", "Service", "Service_Cycles, Service_Activity", [{ label: "On time", cell: cells[0]! }, { label: "Cycle time", cell: cells[1]! }, { label: "Requests per 1 000 wearers", cell: cells[2]! }]);
    tile(s, 0.6, 1.75, 2.9, "Cycles delivered on time", cells[0]!, undefined, true);
    tile(s, 0.6, 3.45, 2.9, "Average cycle time", cells[1]!, "pickup → delivery");
    tile(s, 0.6, 5.15, 2.9, "Service requests", cells[2]!, "per 1 000 wearers");
    const q = v.series.quarterly.find((x) => x.key === "on_time_pct")!;
    s.addText("On-time cycles by quarter (%)", { x: 3.9, y: 1.7, w: 4.5, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    s.addChart(p.ChartType.line, [{ name: "On time", labels: q.points.map((x) => x.period), values: q.points.map((x) => x.cell.value) }], { x: 3.9, y: 2.0, w: 4.5, h: 3.0, chartColors: [C.accent], lineSize: 2.5, lineDataSymbolSize: 8, showValue: true, dataLabelFontSize: 10, dataLabelFormatCode: "0.0", valAxisLabelFontSize: 9, catAxisLabelFontSize: 10, valGridLine: { color: C.line, size: 0.5 }, valAxisMinVal: 90, valAxisMaxVal: 100, valAxisMajorUnit: 2, showLegend: false } as never);
    const low = [...v.sites].sort((a, b) => a.m.on_time_pct!.value - b.m.on_time_pct!.value).slice(0, 5);
    s.addText("Lowest on-time sites", { x: 8.8, y: 1.7, w: 4, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    tbl(s, [[{ text: "Site", options: { bold: true } }, { text: "On time", options: { bold: true, align: "right" } }, { text: "Cycle", options: { bold: true, align: "right" } }], ...low.map((x) => [x.name, { text: x.m.on_time_pct!.display, options: { align: "right" } }, { text: x.m.avg_cycle_h!.display, options: { align: "right" } }])], { x: 8.8, y: 2.05, w: 4, colW: [2.2, 0.9, 0.9], fontFace: FONT, fontSize: 11, color: C.ink, border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.36 });
    s.addText("A cycle counts as late when flagged LATE in the synthetic service-cycle data; the pack carries no reason codes. Status: Calculated.", { x: 3.9, y: 5.25, w: 8.9, h: 0.6, fontFace: FONT, fontSize: 11, color: C.ink2 });
  }

  // 6 · allocation
  {
    const m = v.customerMetrics;
    const top = [...v.sites].sort((a, b) => b.m.excess_pieces!.value - a.m.excess_pieces!.value).slice(0, 6);
    const s = base("Allocation: garments in circulation versus garments in use", "Cost and allocation", "Service_Activity, Products (synthetic purchase cost)", [{ label: "Utilisation", cell: m.util_pct! }, { label: "Surplus", cell: m.excess_pieces! }, { label: "Unused capital", cell: m.unused_cost! }]);
    tile(s, 0.6, 1.75, 2.9, "Garments in active use", m.util_pct!, "scanned ÷ allocated", true);
    tile(s, 0.6, 3.45, 2.9, "Garments above average need", m.excess_pieces!, "vs. customer-average use");
    tile(s, 0.6, 5.15, 2.9, "Capital in unused garments", m.unused_cost!, "synthetic prices");
    s.addText("Sites with the most surplus garments", { x: 3.9, y: 1.7, w: 8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    tbl(s, [["Site", "In use", "Surplus", "Unused value", "Wearers"].map((t, i) => ({ text: t, options: { bold: true, align: i ? "right" : "left" } })), ...top.map((x) => [x.name, x.m.util_pct!.display, x.m.excess_pieces!.display, x.m.unused_cost!.display, x.m.wearers!.display].map((t, i) => ({ text: t, options: { align: i ? "right" : "left" } })))], { x: 3.9, y: 2.05, w: 8.9, colW: [3.3, 1.4, 1.4, 1.6, 1.2], fontFace: FONT, fontSize: 12, color: C.ink, border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.42 });
    s.addText("Surplus is how many garments a site holds above what the customer-average utilisation would need. There are no contract prices in the pack, so the value uses synthetic purchase cost and is an order of magnitude, not a rental saving. Status: Estimated.", { x: 3.9, y: 5.2, w: 8.9, h: 0.9, fontFace: FONT, fontSize: 11, color: C.warn });
  }

  // 7 · repair and circularity
  {
    const hp = v.repairs.handprint;
    const s = base("Repair and circularity: keeping garments in service", "Circularity", "Repairs, Products, Waste_Circularity, Assumptions A002/A003", [...hp.map((h) => ({ label: h.label, cell: h.base })), { label: "Waste diverted", cell: v.circularity.diverted }]);
    s.addText("Handprint from repairs (estimate)", { x: 0.6, y: 1.65, w: 6, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    tbl(s, [["", "Low", "Base", "High"].map((t, i) => ({ text: t, options: { bold: true, align: i ? "right" : "left" } })), ...hp.map((h) => [h.label, h.low.display, h.base.display, h.high.display].map((t, i) => ({ text: t, options: { align: i ? "right" : "left", bold: i === 2 } })))], { x: 0.6, y: 2.0, w: 6.2, colW: [2.6, 1.2, 1.2, 1.2], fontFace: FONT, fontSize: 12, color: C.ink, border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.42 });
    s.addText("Low assumes half of repairs avoid a replacement; base is the pack’s assumption that one repair postpones one replacement. Not an audited claim. Status: Estimated.", { x: 0.6, y: 3.7, w: 6.2, h: 0.8, fontFace: FONT, fontSize: 11, color: C.warn });
    s.addText("Most common repairs", { x: 0.6, y: 4.55, w: 6, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    s.addText(v.repairs.byType.slice(0, 3).map((t) => `${t.label}: ${t.cell.display} (${t.share.display})`).join("   ·   "), { x: 0.6, y: 4.85, w: 6.2, h: 0.7, fontFace: FONT, fontSize: 12, color: C.ink2 });
    s.addText("Where attributed textile waste goes (kg)", { x: 7.2, y: 1.65, w: 5.6, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    s.addChart(p.ChartType.bar, [{ name: "kg", labels: v.circularity.routes.map((r) => r.label), values: v.circularity.routes.map((r) => Math.round(r.cell.value)) }], { x: 7.2, y: 2.0, w: 5.6, h: 3.1, barDir: "bar", chartColors: [C.accent], showValue: true, dataLabelFontSize: 10, dataLabelFormatCode: "#,##0", valAxisHidden: true, valGridLine: { style: "none" }, catAxisLabelFontSize: 11, showLegend: false } as never);
    s.addText(`${v.circularity.diverted.display} stays out of incineration. Allocated from laundry totals by washed-kg share; the baseline assumes all textile waste would go to mixed waste. Status: Allocated.`, { x: 7.2, y: 5.2, w: 5.6, h: 0.8, fontFace: FONT, fontSize: 11, color: C.ink2 });
  }

  // 8 · sites
  {
    const cols = ({ overview: ["wearers", "util_pct", "on_time_pct", "sav_water_pct", "rep_per_100"], water: ["water_per_kg", "sav_water_pct", "sav_water", "kg"], emissions: ["sav_co2_pct", "sav_co2", "kg", "rep_per_100"], cost: ["util_pct", "excess_pieces", "unused_cost", "wearers"], circularity: ["rep", "rep_per_100", "w_div_pct", "kg"], service: ["on_time_pct", "avg_cycle_h", "req_per_1k", "wearers"] } as Record<string, string[]>)[v.params.priority]!;
    const label: Record<string, string> = { wearers: "Wearers", util_pct: "In use", on_time_pct: "On time", sav_water_pct: "Water saving", rep_per_100: "Repairs/100", water_per_kg: "Water l/kg", sav_water: "Water saved", sav_co2_pct: "CO₂e saving", sav_co2: "CO₂e saved", kg: "Washed", excess_pieces: "Surplus", unused_cost: "Unused value", rep: "Repairs", w_div_pct: "Diverted", avg_cycle_h: "Cycle", req_per_1k: "Req/1k" };
    const first = cols[0]!;
    const worseHigh = ["unused_cost", "excess_pieces", "water_per_kg", "req_per_1k", "avg_cycle_h"].includes(first);
    const sorted = [...v.sites].sort((a, b) => (worseHigh ? b.m[first]!.value - a.m[first]!.value : a.m[first]!.value - b.m[first]!.value));
    const show = sorted.slice(0, 8);
    const s = base(`Where the sites differ: ${priorityLabel}`, "Site drill-down", "Sites, Service_Activity, Service_Cycles, Repairs, Laundry_Resources", show.map((x) => ({ label: x.name, cell: x.m[first]! })));
    s.addText(`${v.sites.length <= 8 ? `All ${v.sites.length} sites` : `The 8 least favourable of ${v.sites.length} sites`}, ordered by “${label[first]}”, with the customer total. The dashboard lets you sort by every column.`, { x: 0.6, y: 1.55, w: 12, h: 0.4, fontFace: FONT, fontSize: 13, color: C.ink2 });
    const head = [{ text: "Site", options: { bold: true } }, ...cols.map((c) => ({ text: label[c] ?? c, options: { bold: true, align: "right" as const } }))];
    const body = show.map((x) => [x.name.includes(x.city) ? x.name : `${x.name}  (${x.city})`, ...cols.map((c) => ({ text: x.m[c]!.display, options: { align: "right" as const } }))]);
    const total = [{ text: "Customer", options: { bold: true } }, ...cols.map((c) => ({ text: v.customerMetrics[c]!.display, options: { align: "right" as const, bold: true } }))];
    tbl(s, [head, ...body, total], { x: 0.6, y: 2.05, w: 12.1, colW: [4.2, ...cols.map(() => 7.9 / cols.length)], fontFace: FONT, fontSize: 12, color: C.ink, border: { type: "solid", color: C.line, pt: 0.5 }, rowH: 0.4 });
  }

  // 9 · observations
  {
    const obs = v.observations.slice(0, 4);
    const s = base("What stands out, and what to do about it", "Observations and recommendations", "Generated by transparent rules from the figures in this deck", obs.flatMap((o) => o.evidence));
    obs.forEach((o, i) => {
      const x = 0.6 + (i % 2) * 6.15;
      const y = 1.6 + Math.floor(i / 2) * 2.65;
      s.addShape(p.ShapeType.roundRect, { x, y, w: 5.95, h: 2.5, rectRadius: 0.08, fill: { color: C.white }, line: { color: C.line } });
      s.addShape(p.ShapeType.ellipse, { x: x + 0.18, y: y + 0.2, w: 0.14, h: 0.14, fill: { color: o.tone === "act" ? C.act : o.tone === "watch" ? C.warn : C.good }, line: { color: C.white, width: 0 } });
      s.addText(o.headline, { x: x + 0.4, y: y + 0.08, w: 5.4, h: 0.7, fontFace: FONT, fontSize: 13.5, bold: true, color: C.ink, valign: "top", fit: "shrink" });
      s.addText(o.detail, { x: x + 0.4, y: y + 0.78, w: 5.4, h: 0.85, fontFace: FONT, fontSize: 10.5, color: C.ink2, valign: "top", fit: "shrink" });
      s.addText([{ text: "Action: ", options: { bold: true } }, { text: `${o.action.title} (${o.action.effort} effort)`, options: { breakLine: true } }, { text: "Limits: ", options: { bold: true, color: C.muted } }, { text: o.caveat, options: { color: C.muted } }], { x: x + 0.4, y: y + 1.62, w: 5.4, h: 0.82, fontFace: FONT, fontSize: 9.5, color: C.ink2, valign: "top", fit: "shrink" });
    });
  }

  // 10 · discussion
  {
    const s = base("For the steering committee: questions and next steps", "Discussion", "Observations on the previous slide");
    v.observations.slice(0, 5).forEach((o, i) => {
      const y = 1.65 + i * 0.98;
      s.addText(String(i + 1), { x: 0.6, y, w: 0.6, h: 0.8, fontFace: FONT, fontSize: 26, bold: true, color: C.accent, align: "center", valign: "middle" });
      s.addText(o.discuss, { x: 1.4, y, w: 7.2, h: 0.85, fontFace: FONT, fontSize: 14, color: C.ink, valign: "middle", fit: "shrink" });
      s.addText([{ text: "Agree: ", options: { bold: true } }, { text: o.action.title }], { x: 8.8, y, w: 4, h: 0.85, fontFace: FONT, fontSize: 11.5, color: C.ink2, valign: "middle", fit: "shrink" });
    });
    s.addText("Each agreed action should get a measure and a date, so the next review can show whether it worked.", { x: 0.6, y: 6.25, w: 12, h: 0.35, fontFace: FONT, fontSize: 11, color: C.muted });
  }

  // 11 · method
  {
    const s = base("Method, sources and limits", "Credibility", "Data pack: Assumptions, Data_Quality, Baselines");
    s.addText([
      { text: "How figures are built", options: { bold: true, breakLine: true } },
      { text: "Every figure is calculated from rows in the data pack through a chain of formulas, from Excel cell to site to customer. Each can be opened and recomputed in the dashboard, and totals reconcile with the pack’s own Customer_Impacts sheet.", options: { breakLine: true } },
      { text: " ", options: { breakLine: true } },
      { text: "Status of numbers", options: { bold: true, breakLine: true } },
      { text: "Synthetic: summed straight from the pack. Calculated: ratios and averages of those. Allocated: laundry-level figures shared out by washed-kg share. Estimated: depends on an assumption (comparison baseline, repair ratio, prices).", options: { breakLine: true } },
      { text: " ", options: { breakLine: true } },
      { text: "Selected comparison", options: { bold: true, breakLine: true } },
      { text: `${v.baselineLabel}, ${v.params.scenario} case. Low/high move the alternative’s per-kg values by ∓20 % (a prototype assumption) and test repairs at half strength.`, options: {} },
    ], { x: 0.6, y: 1.6, w: 5.9, h: 5, fontFace: FONT, fontSize: 12, color: C.ink2, valign: "top" });
    s.addText("Known limits and data gaps", { x: 6.9, y: 1.6, w: 5.8, h: 0.3, fontFace: FONT, fontSize: 13, bold: true, color: C.ink });
    s.addText(v.gaps.map((g) => ({ text: `${g.severity.toUpperCase()}  ${g.text}`, options: { bullet: false, breakLine: true } })), { x: 6.9, y: 1.95, w: 5.8, h: 4.8, fontFace: FONT, fontSize: 10, color: C.ink2, valign: "top", paraSpaceAfter: 5, fit: "shrink" });
  }

  return p.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}
