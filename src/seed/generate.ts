import type { Factor, Ledger, Source } from "../model.ts";
import { checksum, round, splitExact, sum } from "../util.ts";
import {
  CUSTOMER_ID,
  CUSTOMER_NAME,
  INGESTED_AT,
  ISSUED,
  LAUNDRY_ID,
  LINEN,
  LINEN_MONTH_WEIGHTS,
  LOSS_ITEMS,
  MONTHS,
  PERIOD_KEYS,
  PERIODS,
  PRICE_PER_KG,
  REPAIRS,
  SERVICES,
  SITE_FEE_PER_QUARTER,
  SITES,
  WATER_M3,
  type PeriodKey,
} from "./plan.ts";

export interface Seed {
  customerId: string;
  customerName: string;
  sites: typeof SITES;
  services: typeof SERVICES;
  sources: Source[];
  factors: Factor[];
  periods: typeof PERIODS;
}

function monthPeriod(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

function makeSource(s: Omit<Source, "checksum">): Source {
  return { ...s, checksum: checksum(s) };
}

const FACTORS: Factor[] = [
  {
    id: "fac:garment-replacement-cost",
    name: "Vaatteen korvaushinta",
    value: 34,
    unit: "EUR/kpl",
    version: "v2",
    validFrom: "2024-01-01",
    sourceRef: "Lindströmin hinnasto, työvaatekorvaus 2025",
    kind: "measured",
  },
  {
    // The counterfactual. Marked proxy ON PURPOSE: this is the weakest link in
    // every "avoided impact" claim and the UI must say so.
    id: "fac:counterfactual-laundry-water",
    name: "Vedenkulutus, oma pesula (vaihtoehto Lindströmille)",
    value: 0.32,
    unit: "m3/kg",
    version: "v1",
    validFrom: "2024-01-01",
    sourceRef: "Toimialakirjallisuus, oma pesulaskenaario — VALIDOITAVA ennen ulkoista väitettä",
    kind: "proxy",
  },
  {
    id: "fac:co2-per-m3-water",
    name: "Veden lämmityksen ja käsittelyn päästökerroin",
    value: 0.34,
    unit: "kgCO2e/m3",
    version: "v1",
    validFrom: "2024-01-01",
    sourceRef: "Pesulan energiamittaridata 2024, laskettu",
    kind: "estimated",
  },
];

/** Deterministic. Same input file, same bytes out, every run. */
export function generate(): Seed {
  const sources: Source[] = [];

  for (const periodKey of PERIOD_KEYS) {
    const q = PERIODS[periodKey];
    const months = MONTHS[periodKey];

    // --- material flow: soiled linen picked up, per site / service / month
    for (const site of SITES) {
      for (const service of SERVICES) {
        const total = LINEN[periodKey][site.key][service.key];
        const perMonth = splitExact(total, LINEN_MONTH_WEIGHTS);
        months.forEach((month, i) => {
          sources.push(
            makeSource({
              id: `src:pickup:${site.key}:${service.key}:${month}`,
              kind: "pickup",
              siteId: site.id,
              serviceId: service.id,
              period: monthPeriod(month),
              value: perMonth[i]!,
              unit: "kg",
              granularity: "period",
              ref: `nouto/${site.key}/${service.key}/${month}`,
              ingestedAt: INGESTED_AT,
            }),
          );
        });
      }
    }

    // --- sustainability flow: laundry water meter
    const water = WATER_M3[periodKey];
    months.forEach((month, i) => {
      sources.push(
        makeSource({
          id: `src:${LAUNDRY_ID}:water:${month}`,
          kind: "meter",
          period: monthPeriod(month),
          value: water[i]!,
          unit: "m3",
          granularity: "daily",
          ref: `mittari/${LAUNDRY_ID}/vesi/${month}`,
          ingestedAt: INGESTED_AT,
        }),
      );
    });

    // --- money
    for (const site of SITES) {
      const kg = sum(SERVICES.map((svc) => LINEN[periodKey][site.key][svc.key]));
      const invoice = round(kg * PRICE_PER_KG[periodKey] + SITE_FEE_PER_QUARTER[periodKey], 2);
      sources.push(
        makeSource({
          id: `src:invoice:${site.key}:${periodKey}`,
          kind: "invoice",
          siteId: site.id,
          period: q,
          value: invoice,
          unit: "EUR",
          granularity: "period",
          ref: `lasku/${site.key}/${periodKey}`,
          ingestedAt: INGESTED_AT,
        }),
      );
    }

    // --- circularity: losses, repairs, garments in circulation
    for (const site of SITES) {
      sources.push(
        makeSource({
          id: `src:loss:${site.key}:${periodKey}`,
          kind: "loss",
          siteId: site.id,
          period: q,
          value: LOSS_ITEMS[periodKey][site.key],
          unit: "kpl",
          granularity: "period",
          ref: `havainto/${site.key}/katoaminen/${periodKey}`,
          ingestedAt: INGESTED_AT,
        }),
        makeSource({
          id: `src:repair:${site.key}:${periodKey}`,
          kind: "repair",
          siteId: site.id,
          period: q,
          value: REPAIRS[periodKey][site.key],
          unit: "kpl",
          granularity: "period",
          ref: `korjaus/${site.key}/${periodKey}`,
          ingestedAt: INGESTED_AT,
        }),
        makeSource({
          id: `src:issued:${site.key}:${periodKey}`,
          kind: "assignment",
          siteId: site.id,
          period: q,
          value: ISSUED[periodKey][site.key],
          unit: "kpl",
          granularity: "period",
          ref: `kierto/${site.key}/${periodKey}`,
          ingestedAt: INGESTED_AT,
        }),
      );
    }
  }

  return {
    customerId: CUSTOMER_ID,
    customerName: CUSTOMER_NAME,
    sites: SITES,
    services: SERVICES,
    sources,
    factors: FACTORS,
    periods: PERIODS,
  };
}

export function periodKeyOf(s: Source): PeriodKey | undefined {
  return PERIOD_KEYS.find(
    (k) => s.period.from >= PERIODS[k].from && s.period.to <= PERIODS[k].to,
  );
}

export function emptyLedger(seed: Seed): Ledger {
  return {
    customerId: seed.customerId,
    sources: seed.sources,
    factors: seed.factors,
    measures: [],
    claims: [],
    drivers: [],
  };
}
