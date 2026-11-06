import type {
  Commitment,
  CommitmentProgress,
  Observation,
  Recommendation,
} from "./model.ts";
import type { RefIndex } from "./ledger.ts";
import { assert } from "./util.ts";

/**
 * Decision support: every observation ends in options, every option carries a
 * cost, and only some options are measurable in this dataset. Saying which is
 * which is the difference between a prototype and a demo.
 */

const WATER_OBS = "obs:water-intensity-up";

export function buildRecommendations(observations: Observation[]): Recommendation[] {
  const hasWater = observations.some((o) => o.id === WATER_OBS);
  if (!hasWater) return [];

  return [
    {
      id: "rec:mats-back-to-2",
      observationId: WATER_OBS,
      title: "A · Palauta mattotiheys kahteen kertaan viikossa",
      action: "Laske mattohuolto takaisin 2 krt/vko Espoossa ja Vantaalla.",
      rationale:
        "Suurin yksittäinen pyykkimäärän lisäys poistuu. Mutta huomio: koska sekä vesi että " +
        "pyykki laskevat, ominaiskulutus ei juuri parane — säästö on litroissa, ei tehosta.",
      expectedImpact: [
        { metricId: "water_m3", delta: -9.4, unit: "%" },
        { metricId: "linen_kg", delta: -10.5, unit: "%" },
      ],
      effort: "low",
      confidence: "measured",
      tradeoffs: [
        {
          metricId: "service_level",
          delta: 0,
          unit: "",
          note: "Palvelutaso laskee: likaisemmat matot sisäänkäynneillä ja korkeampi liukastumisriski.",
        },
      ],
      measurable: false,
    },
    {
      id: "rec:batch-consolidation",
      observationId: WATER_OBS,
      title: "B · Säilytä tiheys, optimoi pesuerien koko",
      action: "Aja vajaat kuormat täysiksi eriksi; siirrä pesupäivät kahdesta kolmeen viikkoon.",
      rationale:
        "Puuttuu nimenomaan siihen osaan nousua jota matto ei selitä. Palvelutaso ei muutu, " +
        "koska mattoja pestään edelleen yhtä usein — vain eräkoko muuttuu.",
      expectedImpact: [
        { metricId: "water_intensity", delta: -8.0, unit: "%" },
        { metricId: "water_m3", delta: -6.5, unit: "%" },
      ],
      effort: "medium",
      confidence: "estimated",
      tradeoffs: [
        {
          metricId: "lead_time",
          delta: 0,
          unit: "",
          note: "Pesulan aikataulu jäykistyy; kiiretilaukset vaativat poikkeuksen.",
        },
      ],
      measurable: true,
      baselineMeasureId: "mea:water_intensity:2025-Q3",
      resultMeasureId: "mea:water_intensity:2025-Q4",
      target: { metricId: "water_intensity", delta: -8, unit: "%", betterWhen: "lower" },
    },
    {
      id: "rec:lighter-mat",
      observationId: WATER_OBS,
      title: "C · Vaihda kevyempään mattomateriaaliin",
      action: "Vaihda matot kevyempään kuituun, joka pestään matalammassa lämpötilassa.",
      rationale:
        "Näyttää voitolta yhdessä sarakkeessa. Ei ole: kevyempi matto kestää noin 20 % vähemmän " +
        "pesuja, joten elinkaaren päästöt nousevat vaikka vesi laskee. Klassinen rebound.",
      expectedImpact: [{ metricId: "water_m3", delta: -6.0, unit: "%" }],
      effort: "high",
      confidence: "estimated",
      tradeoffs: [
        {
          metricId: "co2_kg",
          delta: 8.0,
          unit: "%",
          note: "Elinkaaren CO₂ nousee ~8 %: lyhyempi käyttöikä kumoaa vesivoiton.",
        },
        { metricId: "cost_eur", delta: 4.0, unit: "%", note: "Tiheämpi uusintatahti nostaa kustannusta." },
      ],
      measurable: false,
    },
  ];
}

export function recommendationById(recs: Recommendation[], id: string): Recommendation {
  const r = recs.find((x) => x.id === id);
  assert(r, `unknown recommendation: ${id}`);
  return r;
}

/** Accepting is the only thing that creates a commitment. No commitment, no loop. */
export function accept(
  rec: Recommendation,
  opts: { id: string; acceptedAt: string; acceptedBy?: Commitment["acceptedBy"] },
): Commitment {
  assert(rec.measurable, `recommendation ${rec.id} has no measurable outcome in this dataset`);
  assert(rec.baselineMeasureId && rec.target, `recommendation ${rec.id} is missing a baseline`);
  return {
    id: opts.id,
    recommendationId: rec.id,
    acceptedBy: opts.acceptedBy ?? "both",
    acceptedAt: opts.acceptedAt,
    baselineMeasureId: rec.baselineMeasureId,
    target: rec.target,
    reviewDate: "2026-01-15",
    status: "open",
    resultMeasureId: rec.resultMeasureId,
  };
}

/** Did it work? Recomputed from measures, never from the recommendation's claim. */
export function progress(commitment: Commitment, idx: RefIndex): CommitmentProgress {
  const baseline = idx.measures.get(commitment.baselineMeasureId);
  const result = commitment.resultMeasureId ? idx.measures.get(commitment.resultMeasureId) : undefined;
  assert(baseline, `unknown baseline measure: ${commitment.baselineMeasureId}`);

  if (!result) {
    return {
      actualDelta: 0,
      targetDelta: commitment.target.delta,
      unit: commitment.target.unit,
      met: false,
      baselineValue: baseline.value,
      resultValue: 0,
      verdict: "open",
    };
  }

  const actualDelta = (result.value / baseline.value - 1) * 100;
  const met =
    commitment.target.betterWhen === "lower"
      ? actualDelta <= commitment.target.delta
      : actualDelta >= commitment.target.delta;

  return {
    actualDelta,
    targetDelta: commitment.target.delta,
    unit: commitment.target.unit,
    met,
    baselineValue: baseline.value,
    resultValue: result.value,
    verdict: met ? "measured" : "missed",
  };
}
