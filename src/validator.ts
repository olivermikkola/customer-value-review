import type { Claim, Driver, Measure } from "./model.ts";
import { CONFIDENCE_RANK, worstConfidence } from "./model.ts";
import { claimRecomputes } from "./claims.ts";
import { round } from "./util.ts";

/**
 * The gate between the language model and the human.
 *
 * The model never types a number. It may only place *slots*:
 *   [[clm:water-intensity-up]]        -> rendered from the claim, always
 *   {{drv:mat-frequency}}             -> a quoted driver label, i.e. data
 *
 * That single constraint is what makes V1 (no unsourced number) mechanically
 * checkable instead of a code review.
 */

export type Code =
  | "UNSOURCED_NUMBER"
  | "BROKEN_CHAIN"
  | "UNIT_MISMATCH"
  | "RECOMPUTE_MISMATCH"
  | "UNPINNED_FACTOR"
  | "CONFIDENCE_INFLATED"
  | "UNSUPPORTED_CAUSAL"
  | "UNSUPPORTED_SUPERLATIVE"
  | "ROUNDING_DISTORTS"
  | "UNKNOWN_SLOT"
  | "SUBJECT_MISMATCH"
  | "DUPLICATE_SLOT"
  | "NO_CLAIM";

export interface Verdict {
  ok: boolean;
  code?: Code;
  sentence: string;
  detail?: string;
}

export interface Ctx {
  claims: Map<string, Claim>;
  measures: Map<string, Measure>;
  drivers: Driver[];
}

const CLAIM_SLOT = /\[\[([^[\]]+)\]\]/g;
const DRIVER_SLOT = /\{\{([A-Za-z0-9:_\-]+)\}\}/g;

/** `[[clm:x]]` or `[[clm:x:2]]` — the trailing integer is display decimals. */
function parseSlot(payload: string): { id: string; decimals?: number } {
  const m = /^(.*):(\d+)$/.exec(payload);
  if (m && m[1]) return { id: m[1], decimals: Number(m[2]) };
  return { id: payload };
}

// Stems, not words: Finnish inflects ("aiheuttivat", "johtuen", "selittyy").
const CAUSAL_RE =
  /\b(koska|johtu\p{L}*|aiheutt\p{L}*|selittä\p{L}*|selitti|selitty\p{L}*|sen vuoksi|tästä syystä|seurauksena|vuoksi|takia|ansiosta|liitty\p{L}*)/iu;

/**
 * V10 — a number must sit next to what it measures. A slot is only accepted
 * when its sentence names the claim's subject (any of these stems). This is
 * what stops a small model from sprinkling a correct value into the wrong
 * sentence, which every other rule would let through.
 */
const SUBJECT_STEMS: Record<string, string[]> = {
  "clm:water-intensity-up": ["ominaiskulutu"],
  "clm:water-volume-up": ["kokonaiskulutu", "vedenkulutu"],
  "clm:linen-up": ["pyykki", "pyykin", "pyykkiä"],
  "clm:mat-up": ["matto", "mattoj"],
  "clm:cost-up": ["laskutu"],
  "clm:loss-cost-up": ["katoami", "hävikk"],
  "clm:repair-rate-up": ["korjau"],
  "clm:co2-up": ["päästö"],
  "clm:water-avoided": ["vältet", "säästet", "säästy"],
  "clm:water-attribution": ["matto", "selitty", "selittä"],
  "clm:water-unattributed": ["selittämät", "loput", "loppu"],
  "clm:water-q4": ["q4", "neljän"],
  "clm:intensity-counterfactual": ["ilman"],
};
const SUPERLATIVE_RE =
  /\b(paras|parhain|parhaita|merkittävästi|selvästi parempi|huippu|ennätys)\b/i;

function decimalsFor(claim: Claim, override?: number): number {
  if (override !== undefined) return override;
  switch (claim.stated.unit) {
    case "%":
    case "pp":
      return 1;
    case "m3":
      return 0;
    case "m3/kg":
      return 4;
    case "EUR":
      return 0;
    case "kg":
    case "kgCO2e":
      return 0;
    default:
      return 1;
  }
}

/** The one place a claim value becomes human text. UI and validator share it. */
export function formatClaim(claim: Claim): string {
  return formatClaimValue(claim, decimalsFor(claim));
}

export function formatClaimValue(claim: Claim, decimals: number): string {
  const v = round(claim.stated.value, decimals);
  const body = v.toLocaleString("fi-FI", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  switch (claim.stated.unit) {
    case "%":
      return `${body} %`;
    case "pp":
      return `${body} pp`;
    case "EUR":
      return `${body} €`;
    case "m3":
      return `${body} m³`;
    case "m3/kg":
      return `${body} m³/kg`;
    case "kg":
      return `${body} kg`;
    case "kgCO2e":
      return `${body} kgCO₂e`;
    default:
      return body;
  }
}

/** Replace slots with validated, formatted values. */
export function render(text: string, ctx: Ctx): { text: string; claimIds: string[] } {
  const claimIds: string[] = [];
  const out = text
    .replace(CLAIM_SLOT, (_m, payload: string) => {
      const { id, decimals } = parseSlot(payload);
      const claim = ctx.claims.get(id);
      if (!claim) return `[[?${id}]]`;
      claimIds.push(id);
      return formatClaimValue(claim, decimalsFor(claim, decimals));
    })
    .replace(DRIVER_SLOT, (_m, id: string) => {
      const d = ctx.drivers.find((x) => x.id === id);
      return d ? d.label : `{{?${id}}}`;
    });
  return { text: out, claimIds };
}

function unitsOf(claim: Claim, ctx: Ctx): string[] {
  return claim.measureIds
    .map((id) => ctx.measures.get(id)?.unit)
    .filter((u): u is string => Boolean(u));
}

export function validateSentence(text: string, ctx: Ctx): Verdict {
  const claimIds: string[] = [];
  let unknown: string | undefined;

  for (const m of text.matchAll(CLAIM_SLOT)) {
    const id = parseSlot(m[1]!).id;
    if (!ctx.claims.has(id)) unknown ??= id;
    claimIds.push(id);
  }
  for (const m of text.matchAll(DRIVER_SLOT)) {
    if (!ctx.drivers.some((d) => d.id === m[1])) unknown ??= m[1]!;
  }
  if (unknown) {
    return { ok: false, code: "UNKNOWN_SLOT", sentence: text, detail: unknown };
  }

  // V1 — a digit outside a slot is an unsourced number.
  const bare = text.replace(CLAIM_SLOT, "").replace(DRIVER_SLOT, "");
  if (/\d/.test(bare)) {
    const found = bare.match(/\d+([.,]\d+)?/g)?.join(", ") ?? "";
    return {
      ok: false,
      code: "UNSOURCED_NUMBER",
      sentence: text,
      detail: `luku ilman claim-ID:tä: ${found}`,
    };
  }

  const claims = claimIds.map((id) => ctx.claims.get(id)!);



  for (const claim of claims) {
    // V2 — chain must reach measures that reach sources/factors.
    if (claim.measureIds.length === 0) {
      return { ok: false, code: "BROKEN_CHAIN", sentence: text, detail: claim.id };
    }
    const involved = claim.measureIds.map((id) => ctx.measures.get(id));
    if (involved.some((m) => !m)) {
      return { ok: false, code: "BROKEN_CHAIN", sentence: text, detail: claim.id };
    }
    for (const m of involved as Measure[]) {
      if (m.inputs.length === 0) {
        return { ok: false, code: "BROKEN_CHAIN", sentence: text, detail: m.id };
      }
    }

    // V3 — a change of "X -> Y" requires both sides in the same unit.
    const d = claim.derivation;
    if (d.kind === "change" || d.kind === "delta" || d.kind === "comparison") {
      const us = unitsOf(claim, ctx);
      if (new Set(us).size > 1) {
        return {
          ok: false,
          code: "UNIT_MISMATCH",
          sentence: text,
          detail: `${claim.id}: ${us.join(" vs ")}`,
        };
      }
    }

    // V4 — recompute from the derivation; never trust the model.
    if (!claimRecomputes(claim, { sources: new Map(), measures: ctx.measures, factors: new Map() }, 1e-6)) {
      return { ok: false, code: "RECOMPUTE_MISMATCH", sentence: text, detail: claim.id };
    }

    // V5 — every factor pinned to a version.
    for (const m of involved as Measure[]) {
      for (const f of m.factors) {
        if (!/@v\d+$/.test(f)) {
          return { ok: false, code: "UNPINNED_FACTOR", sentence: text, detail: f };
        }
      }
    }

    // V6 — confidence may not exceed what the inputs support.
    // Lower rank is better, so a claim asserting better than its floor is lying.
    const floor = worstConfidence(...(involved as Measure[]).map((m) => m.confidence));
    if (CONFIDENCE_RANK[claim.confidence] < CONFIDENCE_RANK[floor]) {
      return {
        ok: false,
        code: "CONFIDENCE_INFLATED",
        sentence: text,
        detail: `${claim.id}: ${claim.confidence} > ${floor}`,
      };
    }

    // V9 — display rounding must not flip the sign or hide a non-zero value.
    const slot = [...text.matchAll(CLAIM_SLOT)]
      .map((m) => parseSlot(m[1]!))
      .find((s) => s.id === claim.id);
    if (slot) {
      const dec = decimalsFor(claim, slot.decimals);
      const shown = round(claim.stated.value, dec);
      const halfUnit = 0.5 * 10 ** -dec + 1e-9;
      if (shown === 0 && claim.stated.value !== 0) {
        return { ok: false, code: "ROUNDING_DISTORTS", sentence: text, detail: claim.id };
      }
      if (Math.abs(shown - claim.stated.value) > halfUnit) {
        return { ok: false, code: "ROUNDING_DISTORTS", sentence: text, detail: claim.id };
      }
    }
  }

  // V7 — causal language needs a Driver edge on one of the claims.
  if (CAUSAL_RE.test(text)) {
    // Supported by a claim that has a Driver edge, or by naming a Driver that is not a hypothesis.
    const named = [...text.matchAll(DRIVER_SLOT)].map((m) => ctx.drivers.find((d) => d.id === m[1]));
    const supported =
      claims.some((c) => ctx.drivers.some((d) => d.claimId === c.id || d.evidenceClaimIds.includes(c.id))) ||
      named.some((d) => d && d.method !== "hypothesis");
    if (!supported) {
      return {
        ok: false,
        code: "UNSUPPORTED_CAUSAL",
        sentence: text,
        detail: `mikään väite ei omaa Driver-reunaa: ${claimIds.join(", ")}`,
      };
    }
  }

  // V8 — superlatives need a benchmark.
  if (SUPERLATIVE_RE.test(text)) {
    const supported = claims.some((c) => c.benchmarkMeasureId || c.kind === "benchmark");
    if (!supported) {
      return { ok: false, code: "UNSUPPORTED_SUPERLATIVE", sentence: text, detail: claimIds.join(", ") };
    }
  }

  // V10 last, so older rules keep reporting their own reason first.
  const lower = bare.toLowerCase();
  for (const id of claimIds) {
    const stems = SUBJECT_STEMS[id];
    if (stems && !stems.some((st) => lower.includes(st))) {
      return {
        ok: false,
        code: "SUBJECT_MISMATCH",
        sentence: text,
        detail: `${id} vaatii lauseeseen jonkin: ${stems.join(" / ")}`,
      };
    }
  }
  return { ok: true, sentence: text };
}

export interface NarrativeResult {
  accepted: { text: string; claimIds: string[] }[];
  rejected: Verdict[];
}

export function validateNarrative(sentences: string[], ctx: Ctx): NarrativeResult {
  const accepted: { text: string; claimIds: string[] }[] = [];
  const rejected: Verdict[] = [];
  const used = new Set<string>();
  for (const s of sentences) {
    const v = validateSentence(s, ctx);
    if (!v.ok) {
      rejected.push(v);
      continue;
    }
    // A value quoted twice is decoration, not evidence.
    const r = render(s, ctx);
    // A review sentence carries a claim or names a recorded cause; anything else is filler the reader cannot check.
    if (r.claimIds.length === 0 && !/\{\{drv:/.test(s)) {
      rejected.push({ ok: false, code: "NO_CLAIM", sentence: s });
      continue;
    }
    const again = r.claimIds.find((id) => used.has(id));
    if (again) {
      rejected.push({ ok: false, code: "DUPLICATE_SLOT", sentence: s, detail: again });
      continue;
    }
    r.claimIds.forEach((id) => used.add(id));
    accepted.push(r);
  }
  return { accepted, rejected };
}
