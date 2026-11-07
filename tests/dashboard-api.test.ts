import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { ask, loadAll, meta, trace, view, type Loaded } from "../src/pack/api.ts";
import { measureRecomputes } from "../src/ledger.ts";
import type { Cell } from "../src/pack/view.ts";

let d: Loaded;
before(async () => {
  d = await loadAll();
});
const q = (s: string) => new URLSearchParams(s);

/** Every Cell in a view must point at a real measure whose displayed value is that measure's value. */
function cellsOf(x: unknown, out: Cell[] = []): Cell[] {
  if (Array.isArray(x)) x.forEach((i) => cellsOf(i, out));
  else if (x && typeof x === "object") {
    const o = x as Record<string, unknown>;
    if (typeof o.id === "string" && o.id.startsWith("mea:") && "display" in o) out.push(o as unknown as Cell);
    else Object.values(o).forEach((v) => cellsOf(v, out));
  }
  return out;
}

describe("dashboard API", () => {
  test("meta lists the three customers, five periods, three baselines and six priorities", () => {
    const m = meta(d);
    assert.equal(m.customers.length, 3);
    assert.equal(m.periods.length, 5);
    assert.equal(m.baselines.length, 3);
    assert.equal(m.priorities.length, 6);
    assert.equal(m.customers.find((c) => c.id === "CUST001")!.sites, 24);
  });

  test("every number in every priority view is a ledger measure that still recomputes", () => {
    for (const c of ["CUST001", "CUST002", "CUST003"]) {
      const L = d.ledgers.get(c)!;
      for (const priority of ["overview", "water", "emissions", "cost", "circularity", "service"]) {
        const v = view(d, c, q(`priority=${priority}&period=Q2&baseline=B_HOME&scenario=high`))!;
        const cells = cellsOf(v);
        assert.ok(cells.length > 200, `${c}/${priority}: ${cells.length} cells`);
        for (const cell of cells) {
          const m = L.idx.measures.get(cell.id);
          assert.ok(m, `${c}/${priority}: unknown measure ${cell.id}`);
          assert.equal(m.value, cell.value);
          assert.ok(measureRecomputes(m, L.idx), cell.id);
          assert.ok(cell.status);
        }
      }
    }
  });

  test("priority reorders the first-screen KPIs and the observations, but not the numbers", () => {
    const water = view(d, "CUST001", q("priority=water"))!;
    const cost = view(d, "CUST001", q("priority=cost"))!;
    assert.notEqual(water.kpis[0]!.id, cost.kpis[0]!.id);
    assert.equal(water.observations[0]!.theme, "water");
    assert.equal(cost.observations[0]!.theme, "cost");
    const byId = (v: typeof water) => new Map(v.kpis.map((k) => [k.id, k.cell.value]));
    for (const [id, val] of byId(water)) if (byId(cost).has(id)) assert.equal(byId(cost).get(id), val);
  });

  test("at least three observations, each with evidence, a question, an action and a caveat", () => {
    for (const c of ["CUST001", "CUST002", "CUST003"]) {
      const v = view(d, c, q(""))!;
      assert.ok(v.observations.length >= 3);
      for (const o of v.observations) {
        assert.ok(o.evidence.length >= 2 && o.discuss && o.action.title && o.caveat, o.id);
      }
      assert.equal(v.discussion.length, Math.min(5, v.observations.length));
    }
  });

  test("the industry decides which priority a customer starts on", () => {
    const first = (c: string) => view(d, c, q(""))!.industry.defaultPriority;
    assert.equal(first("CUST001"), "service");
    assert.equal(first("CUST002"), "cost");
    assert.equal(first("CUST003"), "service");
  });

  test("baseline and assumption switches move the savings, and low < base < high", () => {
    const sav = (s: string) => view(d, "CUST001", q(`priority=emissions&scenario=${s}`))!.kpis.find((k) => k.id === "co2S")!.cell.value;
    assert.ok(sav("low") < sav("base") && sav("base") < sav("high"));
    const local = view(d, "CUST001", q("baseline=B_LOCAL"))!.comparison.rows[0]!.saving.value;
    const home = view(d, "CUST001", q("baseline=B_HOME"))!.comparison.rows[0]!.saving.value;
    assert.ok(home > local);
  });

  test("free text becomes a priority, a baseline, a period and a site, deterministically", () => {
    const a = ask(d, "CUST001", "Focus on emissions in Q3 compared with home washing")!;
    assert.deepEqual([a.priority, a.baseline, a.period], ["emissions", "B_HOME", "Q3"]);
    assert.equal(ask(d, "CUST001", "How is water at Helsinki?")!.siteId, "S001");
    assert.equal(ask(d, "CUST001", "Which sites have the greatest textile-allocation optimization potential?")!.priority, "cost");
    assert.equal(ask(d, "CUST001", "How can we improve next year?")!.priority, "overview");
    assert.deepEqual(ask(d, "CUST001", "Focus on emissions in Q3"), ask(d, "CUST001", "Focus on emissions in Q3"));
  });

  test("trace opens one level of evidence and the chain ends at Excel cells", () => {
    let t = trace(d, "CUST001", "mea:sav_water:CUST001:2025-FY:B_LOCAL.base")!;
    assert.ok(t.recomputes && t.inputs.length === 4);
    for (let depth = 0; depth < 12 && t.inputs.some((i) => i.kind === "measure"); depth++) {
      t = trace(d, "CUST001", t.inputs.find((i) => i.kind === "measure")!.ref)!;
    }
    const leaf = t.inputs.find((i) => i.kind === "source");
    assert.ok(leaf && "source" in leaf && /^[A-Za-z_]+!?[A-Z]*\d+|^Service_Cycles\[/.test(String(leaf.source)), JSON.stringify(leaf));
    assert.equal(trace(d, "CUST001", "mea:nope"), null);
    assert.equal(trace(d, "NOPE", "mea:kg:S001:2025-01"), null);
  });
});
