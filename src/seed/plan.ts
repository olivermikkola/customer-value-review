/**
 * The fictional customer the whole demo runs on.
 *
 * These numbers are the single source of truth. Docs quote the output of
 * `npm run facts`, never hand-typed values, so nothing drifts.
 *
 * Shape of the story, deliberately planted:
 *   1. water intensity rises; mat frequency increase explains ~53 %, the rest
 *      is explicitly UNexplained (the credibility beat)
 *   2. loss cost explodes at one site only (a local, fixable problem)
 *   3. repair rate rises (a genuine win — a review that only finds problems
 *      reads like an audit)
 */

export const CUSTOMER_ID = "cus:ravintolaketju-pohjola";
export const CUSTOMER_NAME = "Ravintolaketju Pohjola";

export type PeriodKey = "2024-Q3" | "2025-Q3" | "2025-Q4";
export const PERIOD_KEYS: PeriodKey[] = ["2024-Q3", "2025-Q3", "2025-Q4"];

export const PERIODS: Record<PeriodKey, { from: string; to: string }> = {
  "2024-Q3": { from: "2024-07-01", to: "2024-09-30" },
  "2025-Q3": { from: "2025-07-01", to: "2025-09-30" },
  "2025-Q4": { from: "2025-10-01", to: "2025-12-31" },
};

export const MONTHS: Record<PeriodKey, string[]> = {
  "2024-Q3": ["2024-07", "2024-08", "2024-09"],
  "2025-Q3": ["2025-07", "2025-08", "2025-09"],
  "2025-Q4": ["2025-10", "2025-11", "2025-12"],
};

/** Monthly weights for linen. Sum is irrelevant: the last month absorbs drift. */
export const LINEN_MONTH_WEIGHTS = [0.336, 0.331, 0.333];

export type SiteKey = "kamppi" | "kallio" | "toolo" | "espoo" | "vantaa" | "tapiola";

export const SITES: { id: string; key: SiteKey; name: string; city: string }[] = [
  { id: "site:kamppi", key: "kamppi", name: "Kamppi", city: "Helsinki" },
  { id: "site:kallio", key: "kallio", name: "Kallio", city: "Helsinki" },
  { id: "site:toolo", key: "toolo", name: "Töölö", city: "Helsinki" },
  { id: "site:espoo", key: "espoo", name: "Espoo", city: "Espoo" },
  { id: "site:vantaa", key: "vantaa", name: "Vantaa", city: "Vantaa" },
  { id: "site:tapiola", key: "tapiola", name: "Tapiola", city: "Espoo" },
];

export type ServiceKey = "mats" | "workwear" | "restaurant_textiles";
export const SERVICES: { id: string; key: ServiceKey; name: string }[] = [
  { id: "svc:mats", key: "mats", name: "Matto- ja hygieniapalvelu" },
  { id: "svc:workwear", key: "workwear", name: "Työvaatteet" },
  { id: "svc:restaurant_textiles", key: "restaurant_textiles", name: "Ravintolatekstiilit" },
];

/** Linen kg picked up per site / service / quarter. */
export const LINEN: Record<PeriodKey, Record<SiteKey, Record<ServiceKey, number>>> = {
  "2024-Q3": {
    kamppi: { mats: 1600, workwear: 1900, restaurant_textiles: 3700 },
    kallio: { mats: 1300, workwear: 1700, restaurant_textiles: 3100 },
    toolo: { mats: 1250, workwear: 1650, restaurant_textiles: 2900 },
    espoo: { mats: 1900, workwear: 1750, restaurant_textiles: 2350 },
    vantaa: { mats: 1700, workwear: 1650, restaurant_textiles: 2250 },
    tapiola: { mats: 1150, workwear: 1550, restaurant_textiles: 2700 },
  },
  "2025-Q3": {
    kamppi: { mats: 1600, workwear: 1850, restaurant_textiles: 3450 },
    kallio: { mats: 1300, workwear: 1650, restaurant_textiles: 2950 },
    toolo: { mats: 1250, workwear: 1550, restaurant_textiles: 2600 },
    // mat frequency raised 2 -> 3 per week from 2025-07-01: +2300 kg
    espoo: { mats: 4200, workwear: 1700, restaurant_textiles: 2400 },
    // mat frequency raised 2 -> 3 per week from 2025-07-01: +1800 kg
    vantaa: { mats: 3500, workwear: 1600, restaurant_textiles: 2300 },
    tapiola: { mats: 1150, workwear: 1350, restaurant_textiles: 2000 },
  },
  // Q4 is the quarter AFTER the commitment: batch consolidation was done at the
  // laundry, so intensity drops ~9 %, while service volume keeps growing.
  "2025-Q4": {
    kamppi: { mats: 1630, workwear: 1890, restaurant_textiles: 3520 },
    kallio: { mats: 1330, workwear: 1680, restaurant_textiles: 3010 },
    toolo: { mats: 1280, workwear: 1580, restaurant_textiles: 2650 },
    espoo: { mats: 4300, workwear: 1740, restaurant_textiles: 2430 },
    vantaa: { mats: 3580, workwear: 1640, restaurant_textiles: 2330 },
    tapiola: { mats: 1180, workwear: 1380, restaurant_textiles: 2050 },
  },
};

/** Laundry water meter, m3 per month. One laundry serves all six sites. */
export const WATER_M3: Record<PeriodKey, number[]> = {
  "2024-Q3": [1168, 1152, 1152],
  "2025-Q3": [1412, 1447, 1351],
  // 3902 / 39200 = 0.0995 m3/kg, i.e. -9.2 % vs the Q3 intensity
  "2025-Q4": [1301, 1301, 1300],
};

export const LAUNDRY_ID = "laundry:espoo";

/** Lost / unreturned garment items, per quarter. */
export const LOSS_ITEMS: Record<PeriodKey, Record<SiteKey, number>> = {
  "2024-Q3": { kamppi: 18, kallio: 14, toolo: 12, espoo: 21, vantaa: 17, tapiola: 41 },
  "2025-Q3": { kamppi: 18, kallio: 15, toolo: 13, espoo: 22, vantaa: 17, tapiola: 96 },
  // Tapiola's loss problem was fixed in Q4 (tagging + return policy)
  "2025-Q4": { kamppi: 18, kallio: 15, toolo: 13, espoo: 21, vantaa: 16, tapiola: 44 },
};

/** Repaired garments, per quarter. Rising = good (lifetime extension). */
export const REPAIRS: Record<PeriodKey, Record<SiteKey, number>> = {
  "2024-Q3": { kamppi: 62, kallio: 51, toolo: 48, espoo: 60, vantaa: 55, tapiola: 44 },
  "2025-Q3": { kamppi: 78, kallio: 66, toolo: 59, espoo: 85, vantaa: 74, tapiola: 48 },
  "2025-Q4": { kamppi: 80, kallio: 68, toolo: 61, espoo: 88, vantaa: 76, tapiola: 50 },
};

/** Garments issued / in circulation, per quarter. */
export const ISSUED: Record<PeriodKey, Record<SiteKey, number>> = {
  "2024-Q3": { kamppi: 420, kallio: 350, toolo: 330, espoo: 480, vantaa: 450, tapiola: 420 },
  "2025-Q3": { kamppi: 405, kallio: 340, toolo: 320, espoo: 470, vantaa: 440, tapiola: 405 },
  "2025-Q4": { kamppi: 405, kallio: 340, toolo: 320, espoo: 470, vantaa: 440, tapiola: 400 },
};

/** €/kg service price by period, plus a fixed per-site quarterly fee. */
export const PRICE_PER_KG: Record<PeriodKey, number> = {
  "2024-Q3": 1.94,
  "2025-Q3": 2.01,
  "2025-Q4": 2.03,
};
export const SITE_FEE_PER_QUARTER: Record<PeriodKey, number> = {
  "2024-Q3": 180,
  "2025-Q3": 180,
  "2025-Q4": 180,
};

export const INGESTED_AT = "2025-10-06T08:00:00Z";
