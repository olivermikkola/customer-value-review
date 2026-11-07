import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";

const ROOT = join(import.meta.dirname, "..");
const PACK = join(ROOT, "data/pack/Lindstrom_SinceAI_Customer_Value_Synthetic_Data_Pack.xlsx");
const env = { ...process.env };
delete env.CVR_PACK;
delete env.LANKA_PACK;

test("the pack path accepts the old setting and gives CVR_PACK precedence", () => {
  const code = `import { PACK_FILE } from ${JSON.stringify(new URL("../src/pack/file.ts", import.meta.url).href)}; console.log(PACK_FILE);`;
  for (const [settings, expected] of [
    [{}, PACK],
    [{ CVR_PACK: "/primary.xlsx" }, "/primary.xlsx"],
    [{ LANKA_PACK: "/fallback.xlsx" }, "/fallback.xlsx"],
    [{ CVR_PACK: "/primary.xlsx", LANKA_PACK: "/fallback.xlsx" }, "/primary.xlsx"],
  ] as [NodeJS.ProcessEnv, string][]) {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", code], { env: { ...env, ...settings }, encoding: "utf8", timeout: 15000 });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), expected);
  }
});

test("the product CLI succeeds on the pack and fails on a changed Customer_Impacts figure", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "cvr-verify-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const run = (file: string) => spawnSync(process.execPath, [join(ROOT, "src/pack/cli.ts")], {
    env: { ...env, CVR_PACK: file }, encoding: "utf8", timeout: 15000,
  });
  const good = run(PACK);
  assert.equal(good.status, 0, good.stderr);
  assert.match(good.stdout, /0 failed recomputations · 0 reconciliation mismatches/);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(PACK);
  const sheet = wb.getWorksheet("Customer_Impacts")!;
  const columns = new Map<string, number>();
  sheet.getRow(1).eachCell((cell, col) => columns.set(String(cell.value), col));
  const customer = columns.get("customer_id")!;
  const water = columns.get("allocated_water_l")!;
  assert.ok(customer && water);
  const row = sheet.getRows(2, sheet.rowCount - 1)!.find((r) => r.getCell(customer).value === "CUST001")!;
  assert.ok(row);
  const cell = row.getCell(water);
  assert.equal(typeof cell.value, "number");
  cell.value = Number(cell.value) + 1e9;
  const changed = join(dir, "mismatched.xlsx");
  await wb.xlsx.writeFile(changed);

  const bad = run(changed);
  assert.equal(bad.status, 1, bad.stderr);
  assert.match(bad.stdout, /0 failed recomputations · 1 reconciliation mismatches/);
});
