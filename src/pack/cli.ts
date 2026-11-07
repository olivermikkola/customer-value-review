import { measureRecomputes } from "../ledger.ts";
import { buildPackLedger, mid, YEAR } from "./build.ts";
import { readPack } from "./read.ts";

import { PACK_FILE } from "./file.ts";

const customerId = process.argv[2] ?? "CUST001";
const t0 = Date.now();
const pack = await readPack(PACK_FILE);
const t1 = Date.now();
const L = buildPackLedger(pack, customerId);
const t2 = Date.now();
let bad = 0;
for (const m of L.measures) if (!measureRecomputes(m, L.idx)) bad++;
const t3 = Date.now();
console.log(`${L.customerName} · ${L.industry} · ${L.sites.length} sites`);
console.log(`read ${t1 - t0} ms · build ${t2 - t1} ms · verify ${t3 - t2} ms`);
console.log(`${L.sources.length} sources · ${L.factors.length} factors · ${L.measures.length} measures · ${bad} fail recompute`);
const fy = `${YEAR}-FY`;
const v = (m: string, v?: string) => L.idx.measures.get(mid(m, customerId, fy, v))!;
for (const [m, variant] of [["wearers"], ["alloc"], ["scan"], ["util_pct"], ["kg"], ["req"], ["req_per_1k"], ["on_time_pct"], ["avg_cycle_h"], ["rep"], ["a_water"], ["sav_water", "B_LOCAL.base"], ["sav_water_pct", "B_LOCAL.base"], ["sav_co2", "B_LOCAL.low"], ["sav_co2", "B_LOCAL.base"], ["sav_co2", "B_LOCAL.high"], ["sav_co2_pct", "B_LOCAL.base"], ["rep_postponed", "low"], ["rep_postponed", "base"], ["rep_avoided_co2", "base"], ["w_total"], ["w_div_pct"], ["unused_cost"]] as [string, string?][]) {
  const x = v(m, variant);
  console.log(`  ${x.label.padEnd(46)} ${x.value.toLocaleString("en", { maximumFractionDigits: 2 }).padStart(14)} ${x.unit.padEnd(12)} ${x.status} / ${x.confidence}${variant ? "  [" + variant + "]" : ""}`);
}
console.log("reconciliation against the pack's own Customer_Impacts:");
for (const r of L.reconciliation) console.log(`  ${r.check.padEnd(52)} ours ${r.ours.toFixed(1).padStart(14)}  pack ${r.pack.toFixed(1).padStart(14)}  diff ${(r.relDiff * 100).toFixed(4)} %`);
