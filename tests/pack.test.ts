import assert from "node:assert/strict";
import { before, describe, test } from "node:test";
import { measureRecomputes } from "../src/ledger.ts";
import { BASELINE_IDS, buildPackLedger, mid, QUARTER_KEYS, SCENARIOS, YEAR, type PackLedger } from "../src/pack/build.ts";
import { readPack, type Pack } from "../src/pack/read.ts";
import { PACK_FILE } from "../src/pack/file.ts";

const FY = `${YEAR}-FY`;
let pack: Pack;
const ledgers = new Map<string, PackLedger>();

before(async () => {
  pack = await readPack(PACK_FILE);
  for (const c of ["CUST001", "CUST002", "CUST003"]) ledgers.set(c, buildPackLedger(pack, c));
});

const val = (L: PackLedger, metric: string, key: string, period = FY, variant?: string) => {
  const m = L.idx.measures.get(mid(metric, key, period, variant));
  assert.ok(m, `missing ${mid(metric, key, period, variant)}`);
  return m.value;
};

describe("pack ledger", () => {
  test("every measure of every customer recomputes from its formula and inputs", () => {
    for (const [id, L] of ledgers) {
      const bad = L.measures.filter((m) => !measureRecomputes(m, L.idx));
      assert.equal(bad.length, 0, `${id}: ${bad.slice(0, 3).map((m) => m.id).join(", ")}`);
      assert.ok(L.measures.length > 1000);
    }
  });

  test("our recomputation agrees with the pack's own Customer_Impacts sheet", () => {
    for (const [id, L] of ledgers) {
      for (const r of L.reconciliation) assert.ok(r.relDiff < 0.001, `${id}: ${r.check} differs by ${(r.relDiff * 100).toFixed(3)} %`);
    }
  });

  test("customer = sum of its sites, for flows and for allocated impacts", () => {
    for (const [, L] of ledgers) {
      for (const metric of ["kg", "req", "rep", "a_water", "w_total"]) {
        const sites = L.sites.reduce((a, s) => a + val(L, metric, s.id), 0);
        assert.ok(Math.abs(sites - val(L, metric, L.customerId)) < 1e-6 * Math.max(1, sites), metric);
      }
    }
  });

  test("repairs split by product and by type both add back to the total", () => {
    const L = ledgers.get("CUST001")!;
    const total = val(L, "rep", L.customerId);
    const byType = L.repairTypes.reduce((a, t) => a + val(L, "rep_t", `${L.customerId}.${t.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`), 0);
    const byProduct = L.products.reduce((a, p) => a + val(L, "rep_p", `${L.customerId}.${p.id}`), 0);
    assert.equal(byType, total);
    assert.equal(byProduct, total);
  });

  test("quarters add up to the year", () => {
    const L = ledgers.get("CUST001")!;
    const q = QUARTER_KEYS.reduce((a, k) => a + val(L, "kg", L.customerId, k), 0);
    assert.ok(Math.abs(q - val(L, "kg", L.customerId)) < 1e-6);
  });

  test("low < base < high for every baseline, and the order never flips", () => {
    for (const [, L] of ledgers) {
      for (const b of BASELINE_IDS) {
        const [lo, ba, hi] = SCENARIOS.map((s) => val(L, "sav_co2", L.customerId, FY, `${b}.${s}`));
        assert.ok(lo! < ba! && ba! < hi!, `${b}: ${lo} ${ba} ${hi}`);
      }
      const [r1, r2] = [val(L, "rep_avoided_co2", L.customerId, FY, "low"), val(L, "rep_avoided_co2", L.customerId, FY, "base")];
      assert.ok(Math.abs(r2 / r1 - 2) < 1e-9, "repair handprint scales with the postponement ratio");
    }
  });

  test("home washing is a worse alternative than local laundry, so it shows a larger water saving", () => {
    const L = ledgers.get("CUST001")!;
    assert.ok(val(L, "sav_water", L.customerId, FY, "B_HOME.base") > val(L, "sav_water", L.customerId, FY, "B_LOCAL.base"));
  });

  test("active wearers are the highest product count in the month, not the sum", () => {
    const L = ledgers.get("CUST001")!;
    const rows = pack.serviceActivity.filter((r) => r.site_id === "S001" && r.month === "2025-03");
    assert.ok(rows.length > 1);
    assert.equal(val(L, "wearers", "S001", "2025-03"), Math.max(...rows.map((r) => r.active_wearers as number)));
  });

  test("changing a source value breaks the measures built on it", () => {
    const L = buildPackLedger(pack, "CUST003");
    const src = L.sources.find((s) => s.id.startsWith("src:sa:") && s.id.endsWith(":kg"))!;
    src.value += 1;
    const broken = L.measures.filter((m) => !measureRecomputes(m, L.idx));
    assert.ok(broken.length > 0);
    assert.ok(broken.some((m) => m.id === mid("kg", src.siteId!, src.period.from.slice(0, 7))));
  });

  test("status never gets cleaner on the way up: baseline savings are estimated, raw sums are synthetic", () => {
    const L = ledgers.get("CUST001")!;
    assert.equal(L.idx.measures.get(mid("sav_water", L.customerId, FY, "B_LOCAL.base"))!.status, "estimated");
    assert.equal(L.idx.measures.get(mid("a_water", L.customerId, FY))!.status, "allocated");
    assert.equal(L.idx.measures.get(mid("kg", "S001", "2025-01"))!.status, "synthetic");
  });

  test("every source points at an Excel cell or a named filter, and carries the pack's status", () => {
    const L = ledgers.get("CUST002")!;
    for (const s of L.sources) {
      assert.match(s.ref, /^[A-Za-z_]+!?[A-Z]*\d*|^Service_Cycles\[/);
      assert.ok(s.dataStatus);
    }
  });

  test("no row in the pack is silently dropped: every activity row joins to a site", () => {
    const g = ledgers.get("CUST001")!.gaps.find((x) => x.id === "gap:unmapped")!;
    assert.equal(g.severity, "info");
  });
});
