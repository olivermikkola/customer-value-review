import { assemble } from "./assemble.ts";
import { accept, buildRecommendations, progress } from "./actions.ts";
import type { Claim, Commitment, Driver, Measure, Recommendation } from "./model.ts";
import type { RefIndex } from "./ledger.ts";
import { buildObservations, type Lens } from "./review.ts";
import { render, validateSentence, formatClaim, type Ctx } from "./validator.ts";
import { round } from "./util.ts";

/** Everything the browser needs, precomputed and pre-validated. */
export interface UiData {
  customer: string;
  period: string;
  comparePeriod: string;
  lenses: { id: Lens; label: string }[];
  observations: Record<Lens, UiObservation[]>;
  recommendations: Recommendation[];
  qa: { question: string; lines: { text: string; ok: boolean }[]; code: string | null }[];
  commitment: { commitment: Commitment; progress: ReturnType<typeof progress> } | null;
  followup: {
    period: string;
    rows: { label: string; before: string; after: string; delta: string }[];
  };
}

export interface UiSource {
  ref: string;
  value: string;
  period: string;
}

export interface UiMeasure {
  id: string;
  label: string;
  value: string;
  formula: string;
  confidence: string;
  factors: string[];
  sources: UiSource[];
  children: UiMeasure[];
}

export interface UiObservation {
  id: string;
  claimId: string;
  headline: string;
  severity: "info" | "watch" | "act";
  rank: number;
  materiality: number;
  novelty: number;
  actionability: number;
  claim: {
    id: string;
    value: string;
    display: string;
    unit: string;
    confidence: string;
    kind: string;
    comparedTo?: string;
  };
  measures: UiMeasure[];
  drivers: { id: string; label: string; share: number | null; amount: string | null; method: string }[];
  narrative: string[];
  /** A counterfactual that changes the story, when one exists. */
  check?: string;
}

function fmt(n: number, digits: number): string {
  return round(n, digits).toLocaleString("fi-FI", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function unitSuffix(unit: string): string {
  switch (unit) {
    case "%":
      return " %";
    case "pp":
      return " pp";
    case "m3":
      return " m³";
    case "m3/kg":
      return " m³/kg";
    case "kg":
      return " kg";
    case "EUR":
      return " €";
    case "kgCO2e":
      return " kgCO₂e";
    default:
      return unit ? ` ${unit}` : "";
  }
}

function uiMeasure(id: string, idx: RefIndex, depth = 0): UiMeasure {
  const m: Measure | undefined = idx.measures.get(id);
  if (!m) {
    return { id, label: id, value: "?", formula: "", confidence: "unknown", factors: [], sources: [], children: [] };
  }

  const sources = m.inputs
    .filter((i) => i.startsWith("src:"))
    .map((i) => idx.sources.get(i))
    .filter((s): s is NonNullable<typeof s> => Boolean(s))
    .map((s) => ({ ref: s.ref, value: fmt(s.value, 0) + unitSuffix(s.unit), period: s.period.from }));

  const digits = m.unit === "m3/kg" ? 4 : 0;

  return {
    id: m.id,
    label: m.label,
    value: fmt(m.value, digits) + unitSuffix(m.unit),
    formula: /^v\d+( \+ v\d+)+$/.test(m.formula)
      ? `summa ${m.inputs.length} raakatapahtumasta`
      : m.formula,
    confidence: m.confidence,
    factors: m.factors,
    sources,
    children:
      depth >= 1 ? [] : m.inputs.filter((i) => i.startsWith("mea:")).map((i) => uiMeasure(i, idx, depth + 1)),
  };
}

function uiObservation(
  claim: Claim,
  idx: RefIndex,
  drivers: Driver[],
  ctx: Ctx,
  profile: { severity: UiObservation["severity"]; rank: number; novelty: number; actionability: number },
): UiObservation {
  const mine = drivers.filter((d) => d.claimId === claim.id);

  const CHECK_TEXT =
    "Vastatarkistus: ilman mattotiheyden nostoa ominaiskulutus olisi ollut " +
    "[[clm:intensity-counterfactual]]. Matto ei siis ollut nousun syy.";
  const checkOk = claim.id === "clm:water-intensity-up" && validateSentence(CHECK_TEXT, ctx).ok;

  return {
    id: `obs:${claim.id.replace(/^clm:/, "")}`,
    claimId: claim.id,
    headline: claim.label,
    severity: profile.severity,
    rank: profile.rank,
    materiality: claim.materiality,
    novelty: profile.novelty,
    actionability: profile.actionability,
    claim: {
      id: claim.id,
      value: fmt(claim.stated.value, 2),
      display: formatClaim(claim),
      unit: claim.stated.unit,
      confidence: claim.confidence,
      kind: claim.kind,
      comparedTo: claim.context?.comparedTo,
    },
    measures: claim.measureIds.map((id) => uiMeasure(id, idx)),
    drivers: mine.map((d) => ({
      id: d.id,
      label: d.label,
      share: d.attributedShare,
      amount: d.attributedAmount === null ? null : fmt(d.attributedAmount, 0),
      method: d.method,
    })),
    narrative: mine.map((d) => render(`{{drv:${d.id}}}`, ctx).text),
    check: checkOk ? render(CHECK_TEXT, ctx).text : undefined,
  };
}

export function buildUiData(): UiData {
  const { seed, idx, claims, drivers, observations: base } = assemble();
  const ctx: Ctx = { claims: new Map(claims.map((c) => [c.id, c])), measures: idx.measures, drivers };
  const byId = new Map(claims.map((c) => [c.id, c]));

  const lenses: { id: Lens; label: string }[] = [
    { id: "sustainability", label: "Vastuullisuus" },
    { id: "balanced", label: "Tasapainoinen" },
    { id: "cost", label: "Talous" },
  ];

  const observations = Object.fromEntries(
    lenses.map(({ id: lens }) => [
      lens,
      buildObservations(claims, drivers, 3, lens).map((o) =>
        uiObservation(byId.get(o.claimId)!, idx, drivers, ctx, {
          severity: o.severity,
          rank: o.rank,
          novelty: o.novelty,
          actionability: o.actionability,
        }),
      ),
    ]),
  ) as Record<Lens, UiObservation[]>;

  const recs = buildRecommendations(base);
  const chosen = recs.find((r) => r.id === "rec:batch-consolidation");
  const commitment =
    chosen && chosen.measurable
      ? (() => {
          const c = accept(chosen, { id: "cmt:2025-Q4-batching", acceptedAt: "2025-10-14" });
          return { commitment: c, progress: progress(c, idx) };
        })()
      : null;

  const qaSpecs = [
    {
      question: "Miksi vesi nousi?",
      lines: [
        "Mattotiheyden nosto kahdella toimipisteellä selittää noin [[clm:water-attribution:0]] noususta.",
        "Loput [[clm:water-unattributed]] ajoittuu Espoon pesulan vajaiden kuormien jaksoon; syytä ei ole vahvistettu.",
      ],
    },
    {
      question: "Ollaanko me parempia kuin muut?",
      lines: ["Vedenkulutus on merkittävästi parempi kuin muilla toimijoilla [[clm:water-intensity-up]]."],
    },
    { question: "Paljonko vettä kului Q4:llä?", lines: ["Vettä kului [[clm:water-q4]]."] },
  ];

  const qa = qaSpecs.map(({ question, lines }) => {
    const results = lines.map((l) => {
      const v = validateSentence(l, ctx);
      return { text: render(l, ctx).text, ok: v.ok, code: v.ok ? null : v.code };
    });
    return {
      question,
      lines: results.map(({ text, ok }) => ({ text, ok })),
      code: results.find((r) => !r.ok)?.code ?? null,
    };
  });

  const v = (id: string) => idx.measures.get(id)?.value ?? 0;
  const row = (label: string, metric: string, unit: string, digits: number) => {
    const before = v(`mea:${metric}:2025-Q3`);
    const after = v(`mea:${metric}:2025-Q4`);
    return {
      label,
      before: fmt(before, digits) + unitSuffix(unit),
      after: fmt(after, digits) + unitSuffix(unit),
      delta: fmt((after / before - 1) * 100, 1) + " %",
    };
  };

  return {
    customer: seed.customerName,
    period: "Q3 2025",
    comparePeriod: "Q3 2024",
    lenses,
    observations,
    recommendations: recs,
    qa,
    commitment,
    followup: {
      period: "Q4 2025",
      rows: [
        row("Veden ominaiskulutus", "water_intensity", "m3/kg", 4),
        row("Vedenkulutus", "water_m3", "m3", 0),
        row("Katoamisen kustannus", "loss_cost_eur", "EUR", 0),
        row("Palvelulaskutus", "cost_eur", "EUR", 0),
      ],
    },
  };
}
