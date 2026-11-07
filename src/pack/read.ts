/**
 * Reads the Lindström synthetic data pack (xlsx) into typed rows.
 *
 * Every row keeps its Excel row number, so a Source can point at the exact cell
 * it came from. The reader refuses silently-wrong input: a missing sheet, a
 * missing column or a non-numeric number cell stops the load.
 */
import ExcelJS from "exceljs";
import { assert } from "../util.ts";

export type Row = Record<string, string | number> & { __row: number };

export interface Pack {
  file: string;
  customers: Row[];
  laundries: Row[];
  products: Row[];
  sites: Row[];
  industryPriorities: Row[];
  serviceActivity: Row[];
  repairs: Row[];
  serviceCycles: Row[];
  laundryResources: Row[];
  wasteCircularity: Row[];
  baselines: Row[];
  customerImpacts: Row[];
  assumptions: Row[];
  dataQuality: Row[];
  suggestedPrompts: Row[];
}

const SHEETS: Record<keyof Omit<Pack, "file">, { sheet: string; required: string[] }> = {
  customers: { sheet: "Customers", required: ["customer_id", "customer_name", "industry"] },
  laundries: { sheet: "Laundries", required: ["laundry_id", "laundry_name", "country"] },
  products: {
    sheet: "Products",
    required: ["product_id", "product_name", "synthetic_product_footprint_kgco2e", "synthetic_purchase_cost_eur"],
  },
  sites: { sheet: "Sites", required: ["site_id", "customer_id", "site_name", "primary_laundry_id"] },
  industryPriorities: { sheet: "Industry_Priorities", required: ["industry", "priority_rank", "priority_theme"] },
  serviceActivity: {
    sheet: "Service_Activity",
    required: [
      "month", "customer_id", "site_id", "laundry_id", "product_id", "active_wearers", "allocated_pieces",
      "active_assets_scanned", "washed_pieces", "packed_pieces", "customer_washed_kg", "service_requests",
    ],
  },
  repairs: {
    sheet: "Repairs",
    required: ["month", "customer_id", "site_id", "product_id", "repair_type", "repair_count"],
  },
  serviceCycles: {
    sheet: "Service_Cycles",
    required: ["asset_id", "site_id", "pickup_timestamp", "cycle_hours", "performance_flag"],
  },
  laundryResources: {
    sheet: "Laundry_Resources",
    required: ["month", "laundry_id", "washed_kg", "fresh_water_l", "process_energy_kwh", "process_emissions_kgco2e", "delivery_emissions_kgco2e"],
  },
  wasteCircularity: {
    sheet: "Waste_Circularity",
    required: ["month", "laundry_id", "recycling_kg", "reuse_kg", "energy_recovery_kg", "incineration_kg", "textile_waste_total_kg"],
  },
  baselines: {
    sheet: "Baselines",
    required: ["baseline_id", "baseline_name", "water_l_per_kg", "energy_kwh_per_kg", "process_kgco2e_per_kg", "delivery_kgco2e_per_kg", "mixed_waste_share"],
  },
  customerImpacts: {
    sheet: "Customer_Impacts",
    required: ["month", "site_id", "product_id", "allocated_water_l", "water_saving_vs_local_l", "emissions_saving_vs_local_kgco2e"],
  },
  assumptions: { sheet: "Assumptions", required: ["assumption_id", "assumption", "value_or_rule"] },
  dataQuality: { sheet: "Data_Quality", required: ["dataset", "status", "confidence"] },
  suggestedPrompts: { sheet: "Suggested_Prompts", required: ["user_type", "prompt"] },
};

function cellValue(v: ExcelJS.CellValue): string | number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 19).replace("T", " ");
  if (typeof v === "object") {
    if ("result" in v) return cellValue(v.result as ExcelJS.CellValue);
    if ("text" in v) return String(v.text);
    return String(v);
  }
  return v as string | number;
}

export async function readPack(file: string): Promise<Pack> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const pack = { file } as Record<string, unknown>;

  for (const [key, spec] of Object.entries(SHEETS)) {
    const ws = wb.getWorksheet(spec.sheet);
    assert(ws, `data pack: sheet "${spec.sheet}" not found in ${file}`);
    const header: string[] = [];
    ws.getRow(1).eachCell((c, col) => (header[col - 1] = String(cellValue(c.value) ?? "")));
    for (const col of spec.required) {
      assert(header.includes(col), `data pack: sheet "${spec.sheet}" has no column "${col}"`);
    }
    const rows: Row[] = [];
    ws.eachRow((r, n) => {
      if (n === 1) return;
      const row = { __row: n } as Row;
      let empty = true;
      header.forEach((h, i) => {
        const v = cellValue(r.getCell(i + 1).value);
        if (v !== null && v !== "") empty = false;
        if (h) row[h] = v ?? "";
      });
      if (!empty) rows.push(row);
    });
    pack[key] = rows;
  }
  return pack as unknown as Pack;
}

export function num(row: Row, col: string, sheet: string): number {
  const v = row[col];
  assert(typeof v === "number" && Number.isFinite(v), `${sheet} row ${row.__row}: "${col}" is not a number (${String(v)})`);
  return v;
}

export function str(row: Row, col: string): string {
  return String(row[col]);
}
