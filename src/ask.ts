import type { Claim, Driver } from "./model.ts";
import { SYSTEM, verbFor, type SentenceTask } from "./llm.ts";
import { formatClaim } from "./validator.ts";

/**
 * "Ask the review": a customer or key account manager asks in their own words,
 * and the answer is built only from claims this review can prove.
 *
 * The *code* decides which claims a question is about — small models choose
 * badly, and a wrong choice here would be a confident answer to the wrong
 * question. The model only phrases the facts it is handed, and the same gate
 * judges every sentence. No match means an honest "no verified data".
 */

/** Words a person uses for a claim. Stems, lower-case; Finnish inflects. */
const ASK_STEMS: Record<string, string[]> = {
  "clm:water-intensity-up": ["ominaiskulutu", "kiloa kohden", "per kilo", "tehokk", "tehott"],
  "clm:water-volume-up": ["vesi", "vettä", "veden", "vedenkulutu", "kokonaiskulutu"],
  "clm:linen-up": ["pyykki", "pyykin", "pyykkiä", "pesty", "pestiin", "pesumäär"],
  "clm:mat-up": ["matto", "matot", "mattoj", "mattoa"],
  "clm:cost-up": ["lasku", "maksa", "hinta", "hinna", "kallis", "kallii", "kustannu", "euro"],
  "clm:loss-cost-up": ["katoa", "katoam", "kadon", "kadonn", "hävikk", "hävi", "hukk", "kustannu"],
  "clm:repair-rate-up": ["korja", "kierrät", "kiertotalou", "uusi vaate", "uusia vaatte", "kesto"],
  "clm:co2-up": ["päästö", "co2", "co₂", "hiili", "ilmasto", "ympäristö", "vastuullisuu"],
  "clm:water-avoided": ["säästet", "säästy", "säästi", "säästö", "vältet", "oma pesula", "omaa pesula", "hyöty", "hyödy"],
  "clm:water-q4": ["q4", "neljäs", "neljänne", "loka", "marras", "joulu", "viime kvartaal"],
};

/** Words for a recorded cause; a hit pulls in the driver and the claim it explains. */
const DRIVER_STEMS: Record<string, string[]> = {
  "drv:mat-frequency": ["mattotihey", "mattojen määr", "mattojen vaihto"],
  "drv:partial-loads": ["vajaa", "vajai", "kuorm", "elokuu"],
  "drv:tapiola-loss": ["tapiola"],
};

const WHY_RE = /\b(miksi|mistä|syy|johtu|selitt|miten niin|mikä aiheutt)/i;
/** Comparisons need peer data this review does not have — say so instead of guessing. */
const COMPARE_RE = /(parempi|paremp|huonomp|muihin|muut |muita|muiden|kilpailij|keskiarvo|vertai|alan keskim)/i;

export interface AskTask extends SentenceTask {
  /** Template sentences that pass the gate by construction; shown when the model fails twice. */
  fallbacks: string[];
  /** Claim to open in the review when a number in the answer is clicked (evidence claims open their parent). */
  open: Record<string, string>;
}

export type AskResult = { task: AskTask; matched: string[] } | { task: null; reason: string };

/** Longer matched stems weigh more: "säästettiin" is about savings before it is about water. */
function hits(q: string, stems: string[]): number {
  return stems.filter((s) => q.includes(s)).reduce((sum, s) => sum + s.length, 0);
}

export function matchQuestion(
  question: string,
  claims: Claim[],
  drivers: Driver[],
): { claimIds: string[]; driverIds: string[]; why: boolean; compare: boolean } {
  const q = ` ${question.toLowerCase()} `;
  const byId = new Map(claims.map((c) => [c.id, c]));

  const scored = Object.entries(ASK_STEMS)
    .map(([id, stems]) => ({ id, score: hits(q, stems) }))
    .filter((x) => x.score > 0 && byId.has(x.id));

  const driverIds = Object.entries(DRIVER_STEMS)
    .filter(([, stems]) => hits(q, stems) > 0)
    .map(([id]) => id)
    .filter((id) => drivers.some((d) => d.id === id));

  // A named cause brings the claim it explains, even when the question never names it.
  for (const id of driverIds) {
    const d = drivers.find((x) => x.id === id)!;
    const s = scored.find((x) => x.id === d.claimId);
    if (s) s.score += 20;
    else scored.push({ id: d.claimId, score: 20 });
  }

  scored.sort((a, b) => b.score - a.score || byId.get(b.id)!.materiality - byId.get(a.id)!.materiality);
  const claimIds = scored.slice(0, 2).map((x) => x.id);
  return { claimIds, driverIds, why: WHY_RE.test(q), compare: COMPARE_RE.test(q) };
}

export function askTask(question: string, claims: Claim[], drivers: Driver[]): AskResult {
  const m = matchQuestion(question, claims, drivers);
  const byId = new Map(claims.map((c) => [c.id, c]));

  if (m.compare && !claims.some((c) => c.kind === "benchmark" || c.benchmarkMeasureId)) {
    return {
      task: null,
      reason:
        "Vertailuun muihin asiakkaisiin ei ole todennettua dataa tässä katsauksessa. " +
        "Se vaatii useamman asiakkaan vertaisdatan, eikä sitä arvata.",
    };
  }
  if (m.claimIds.length === 0) {
    return {
      task: null,
      reason: "Tähän kysymykseen ei löytynyt todennettua lukua tästä katsauksesta. Kokeile esim. vettä, katoamisia, laskutusta tai päästöjä.",
    };
  }

  const claimIds = [...m.claimIds];
  const driverIds = new Set(m.driverIds);
  // "Why" brings every recorded cause of the matched claims, with the numbers that back them.
  if (m.why) for (const d of drivers) if (claimIds.includes(d.claimId)) driverIds.add(d.id);

  const open: Record<string, string> = {};
  const lines: string[] = [];
  const fallbacks: string[] = [];

  for (const id of m.claimIds) {
    const c = byId.get(id)!;
    const verb = verbFor(c);
    lines.push(`Fakta: ${c.label} ${verb} ${formatClaim(c)}.`);
    fallbacks.push(c.kind === "change" ? `${c.label} ${verb} [[${c.id}]].` : `${c.label}: [[${c.id}]].`);
    open[id] = id;
  }

  for (const d of drivers.filter((x) => driverIds.has(x.id))) {
    lines.push(
      d.method === "hypothesis"
        ? `Mahdollinen syy (EI vahvistettu, sano 'ajoittuu samaan aikaan'): ${d.label}.`
        : `Todettu syy: ${d.label}.`,
    );
    for (const eid of d.evidenceClaimIds) {
      const e = byId.get(eid);
      if (!e || claimIds.includes(eid)) continue;
      claimIds.push(eid);
      open[eid] = d.claimId;
      lines.push(`  Luku: ${e.label} ${formatClaim(e)}.`);
    }
    fallbacks.push(
      d.method === "hypothesis"
        ? `Samaan aikaan ajoittuu: {{${d.id}}}; syytä ei ole vahvistettu.`
        : `Todettu tekijä: {{${d.id}}}.`,
    );
  }

  const user = [
    `Kysymys: ${question.trim()}`,
    "",
    "Vastaa kysymykseen vain näillä tiedoilla:",
    ...lines,
    "",
    "Kirjoita yhdestä kolmeen lausetta. Vastaa suoraan kysymykseen. Älä aloita lausetta sanalla 'Tämä'.",
  ].join("\n");

  return {
    task: {
      claimId: m.claimIds[0]!,
      claimIds,
      driverIds: [...driverIds],
      system: SYSTEM,
      user,
      fallback: fallbacks[0]!,
      fallbacks,
      open,
    },
    matched: claimIds.map((id) => byId.get(id)!.label),
  };
}
