import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { answer, gate, loadAll, narrate, view, type Loaded } from "../src/pack/api.ts";
import { gateText, observationTask, routeQuestion, summaryTask, tasksFor } from "../src/pack/narrate.ts";
import { interpret } from "../src/pack/view.ts";

let d: Loaded;
before(async () => {
  d = await loadAll();
});
const qs = (s: string) => new URLSearchParams(s);
const v1 = () => view(d, "CUST001", qs("priority=water"))!;

/** A task whose first fact is an estimate, so the hedge rule applies. */
function waterTask() {
  const v = v1();
  const o = v.observations.find((x) => x.id === "obs:water")!;
  return { v, task: observationTask(v, o) };
}
const codes = (g: ReturnType<typeof gateText>) => g.rejected.map((r) => r.code);

describe("tasks", () => {
  test("a task's facts are exactly the observation's evidence cells, and the prompt shows only those figures", () => {
    const { v, task } = waterTask();
    const o = v.observations.find((x) => x.id === "obs:water")!;
    assert.deepEqual(task.facts.map((f) => f.measureId), [...new Set(o.evidence.map((e) => e.cell.id))]);
    for (const f of task.facts) assert.ok(task.user.includes(f.display));
    assert.ok(tasksFor(v).length >= 4);
    assert.equal(summaryTask(v).kind, "summary");
  });
});

describe("the gate", () => {
  test("accepts a sentence that copies a given figure and calls it an estimate; links it to its measure", () => {
    const { v, task } = waterTask();
    const f = task.facts[0]!;
    const g = gateText(task, v, `Compared with the alternative, the service used an estimated ${f.display} less fresh water.`);
    assert.deepEqual(codes(g), []);
    assert.equal(g.accepted.length, 1);
    assert.equal(g.accepted[0]!.facts[0]!.measureId, f.measureId);
  });

  test("refuses a figure it was not given", () => {
    const { v, task } = waterTask();
    const g = gateText(task, v, "An estimated 9,999 m³ less water was used.");
    assert.deepEqual(codes(g), ["UNSOURCED_NUMBER"]);
    assert.match(g.feedback!, /UNSOURCED_NUMBER/);
  });

  test("refuses a figure written with another figure's unit", () => {
    const { v, task } = waterTask();
    const pct = task.facts.find((f) => f.display.includes("%"));
    const n = (pct ?? task.facts[0]!).display.match(/[\d,.]+/)![0];
    const g = gateText(task, v, `An estimated ${n} tCO₂e less was used.`);
    assert.ok(["UNIT_MISMATCH", "UNSOURCED_NUMBER"].includes(g.rejected[0]!.code), JSON.stringify(g.rejected));
  });

  test("refuses causes, overclaims and invented ratios", () => {
    const { v, task } = waterTask();
    const f = task.facts[0]!.display;
    assert.deepEqual(codes(gateText(task, v, `An estimated ${f} was saved because the laundry improved.`)), ["CAUSAL"]);
    assert.deepEqual(codes(gateText(task, v, `This is the best result, an estimated ${f}.`)), ["OVERCLAIM"]);
    assert.deepEqual(codes(gateText(task, v, `Water use was cut by about half, an estimated ${f}.`)), ["WORD_NUMBER"]);
  });

  test("'root cause' in an action is not a causal claim, but 'because' is", () => {
    const { v, task } = waterTask();
    const f = task.facts[0]!.display;
    assert.deepEqual(codes(gateText(task, v, `An estimated ${f} less water, so we should find the root cause of the gap.`)), []);
    assert.deepEqual(codes(gateText(task, v, `An estimated ${f} less water, because it was caused by the laundry.`)), ["CAUSAL"]);
  });

  test("copying the fact format (brackets, markers) is refused; numbers inside the notes are allowed", () => {
    const v = view(d, "CUST001", qs("priority=circularity"))!;
    const task = summaryTask(v);
    const f = task.facts[0]!;
    assert.deepEqual(codes(gateText(task, v, `${f.label} is ${f.display} (estimated) [${f.note}].`)), ["COPIED_FORMAT"]);
    assert.deepEqual(codes(gateText(task, v, `${f.label}: ${f.display}`)), ["COPIED_FORMAT"]);
    assert.deepEqual(codes(gateText(task, v, `The service delivered ${f.display} — this is an estimate.`)), ["COPIED_FORMAT"]);
    const withNote = task.facts.find((x) => x.note && /\d/.test(x.note));
    if (withNote) assert.ok(!codes(gateText(task, v, `An estimated ${withNote.display} for ${withNote.label.toLowerCase()}, on the assumption of 1 repair for 1 replacement.`)).includes("UNSOURCED_NUMBER"));
  });

  test("an estimated figure must be called an estimate", () => {
    const { v, task } = waterTask();
    const f = task.facts[0]!;
    assert.equal(f.status, "estimated");
    const g = gateText(task, v, `The service used ${f.display} less fresh water.`);
    assert.deepEqual(codes(g), ["MISSING_HEDGE"]);
  });

  test("refuses a site that is not in the facts", () => {
    const v = v1();
    const o = v.observations.find((x) => x.id === "obs:water")!;
    const task = observationTask(v, o);
    const stray = v.sites.find((s) => !task.siteNames.includes(s.name))!;
    const g = gateText(task, v, `An estimated ${task.facts[0]!.display} was saved, and ${stray.name} did well.`);
    assert.deepEqual(codes(g), ["WRONG_SITE"]);
  });

  test("a sentence with no figure, too many sentences and an empty answer are refused", () => {
    const { v, task } = waterTask();
    assert.deepEqual(codes(gateText(task, v, "The service went well overall.")), ["NO_FIGURE"]);
    const f = task.facts[0]!.display;
    const many = [1, 2, 3].map(() => `An estimated ${f} less water.`).join("\n").replace(/(.*)\n\1/g, "$1");
    assert.deepEqual(codes(gateText(task, v, `An estimated ${f} less water.\nAbout ${f} less water was used.\nRoughly ${f} less water, as estimated.`)), ["TOO_MANY"]);
    assert.ok(many.length > 0);
    assert.deepEqual(codes(gateText(task, v, "")), ["EMPTY"]);
  });

  test("a retry keeps what was accepted and only judges the new sentences", () => {
    const { v, task } = waterTask();
    const f = task.facts[0]!.display;
    const first = gateText(task, v, `An estimated ${f} less water.\nIt saved 777 m³.`);
    assert.deepEqual(codes(first), ["UNSOURCED_NUMBER"]);
    assert.equal(first.kept.length, 1);
    const second = gateText(task, v, "Worth discussing: which baseline you would trust.", first.kept);
    assert.deepEqual(codes(second), []);
    assert.equal(second.accepted.length, 2);
  });

  test("the year and quarter labels are allowed; the site count is allowed", () => {
    const v = view(d, "CUST001", qs("priority=service&period=Q3"))!;
    const task = summaryTask(v);
    const f = task.facts[0]!;
    const g = gateText(task, v, `In Q3 2025, across ${v.customer.siteCount} sites, ${f.label.toLowerCase()} was ${f.display}.`);
    assert.deepEqual(codes(g).filter((c) => c === "UNSOURCED_NUMBER"), []);
  });
});

describe("questions", () => {
  const route = (q: string, extra = "") => {
    const v = view(d, "CUST001", qs(extra))!;
    return routeQuestion(v, q, interpret(q, d.ledgers.get("CUST001")!));
  };

  test("the pack's own suggested prompts all become tasks, none is called 'no data'", () => {
    for (const q of ["Show the value created for NorthStar Foods Group in 2025.", "Focus on water and emissions for the food-industry sites.", "Which sites have the greatest textile-allocation optimization potential?", "How can we improve our performance next year?", "Compare our circular service with local laundry.", "Prepare five discussion points for the annual steering committee."]) {
      assert.ok("task" in route(q), q);
    }
  });

  test("things the data cannot answer are refused honestly, naming Lindström's module where one fits", () => {
    const price = route("What did we pay per month?");
    assert.ok("noData" in price && !price.noData.module);
    const bench = route("How do we compare with other customers?");
    assert.ok("noData" in bench && bench.noData.module?.name === "Performance reporting & benchmarking");
    const fc = route("Forecast our water use next quarter");
    assert.ok("noData" in fc && fc.noData.module?.name === "Predictive & AI-assisted insights");
    const esg = route("Is this CSRD audit ready?");
    assert.ok("noData" in esg && esg.noData.module?.name === "Sustainability & compliance intelligence");
  });

  test("causes and change over time are refused honestly, not answered with a made-up story", () => {
    for (const q of ["Why did emissions go down?", "Did we fix the lateness problem?", "Is service better than last year?"]) {
      const r = route(q);
      assert.ok("noData" in r, q);
    }
    assert.ok("task" in route("How can we improve our performance next year?"));
  });

  test("discussion-point and improvement questions are answered from the observations' own questions and actions", () => {
    const dp = route("Prepare five discussion points for the annual steering committee.");
    assert.ok("task" in dp && dp.task.maxSentences === 5 && dp.task.fallbacks.length >= 3);
    const imp = route("How can we improve our performance next year?");
    assert.ok("task" in imp && /recommendations/.test(imp.task.user));
  });

  test("'compare with local laundry' is answered from the comparison block; a site question carries the customer-wide figure", () => {
    const c = route("Compare our circular service with local laundry.");
    assert.ok("task" in c && c.task.facts.some((f) => /saved compared with outsourced local laundry/.test(f.label)));
    const s = route("Is Pori worse than the others on delivery?");
    assert.ok("task" in s && s.task.facts.some((f) => f.label.startsWith("All 24 sites together")));
  });

  test("a site question's fallback is about that site, not the lead observation", () => {
    const r = route("How is service at Helsinki?");
    assert.ok("task" in r && r.task.fallbacks[0]!.startsWith("NorthStar Helsinki"));
  });

  test("a figure's own label may carry a number: 'per 1 000 wearers'", () => {
    const v = view(d, "CUST001", qs(""))!;
    const r = routeQuestion(v, "How is service at Helsinki?", interpret("How is service at Helsinki?", d.ledgers.get("CUST001")!));
    assert.ok("task" in r);
    const f = r.task.facts.find((x) => x.label.includes("per 1 000 wearers"))!;
    const g = gateText(r.task, v, `Helsinki has ${f.display} service requests per 1,000 wearers.`);
    assert.ok(!g.rejected.some((x) => x.code === "UNSOURCED_NUMBER"), JSON.stringify(g.rejected));
  });

  test("a site question brings that site's figures into the facts", () => {
    const r = route("How is service at Helsinki?");
    assert.ok("task" in r);
    assert.ok(r.task.facts.some((f) => f.label.startsWith("NorthStar Helsinki")), JSON.stringify(r.task.facts.map((f) => f.label)));
    assert.ok(r.task.siteNames.includes("NorthStar Helsinki"));
  });
});

describe("API", () => {
  test("narrate gives the tasks without exposing facts; gate rebuilds the task itself", () => {
    const n = narrate(d, "CUST001", qs("priority=emissions"))!;
    assert.ok(n.tasks.length >= 4);
    assert.ok(!("facts" in n.tasks[0]!));
    const g = gate(d, { customer: "CUST001", params: { priority: "emissions" }, task: "summary", raw: "Cycles delivered on time was 12.3 %." })!;
    assert.deepEqual(g.rejected.map((r) => r.code), ["UNSOURCED_NUMBER"]);
    assert.equal(gate(d, { customer: "CUST001", params: {}, task: "obs:nope", raw: "x" }), null);
  });

  test("answer returns a task with the parameters the question implied", () => {
    const a = answer(d, "CUST001", "Focus on emissions in Q3 compared with home washing", qs(""))!;
    assert.ok("task" in a);
    assert.deepEqual([a.params!.priority, a.params!.period, a.params!.baseline], ["emissions", "Q3", "B_HOME"]);
    const g = gate(d, { customer: "CUST001", params: a.params, task: "answer", question: "Focus on emissions in Q3 compared with home washing", raw: "Totally invented 123 tCO₂e." })!;
    assert.ok(g.rejected.length > 0);
  });
});
